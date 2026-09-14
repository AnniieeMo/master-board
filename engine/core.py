"""Deterministic planning core; intentionally independent from the HTTP server."""

from __future__ import annotations

from copy import deepcopy
from datetime import date, timedelta
import re
from typing import Any


DEFAULT_POLICY = {
    'timezone': 'Asia/Shanghai',
    'work_windows': [('09:30', '13:00'), ('14:30', '18:30')],
    'study_windows': [('20:00', '24:00')],
    'work_soft_capacity_minutes': 270,
    'study_soft_capacity_minutes': 90,
    'default_work_duration_minutes': 45,
    'default_study_duration_minutes': 35,
    'slot_granularity_minutes': 5,
    'max_automatic_carries': 3,
    'working_weekdays': [0, 1, 2, 3, 4],
}

WEEKDAY_NAMES = {'一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6}


def _minutes(value: str) -> int:
    hour, minute = map(int, value.split(':'))
    if hour == 24 and minute == 0:
        return 24 * 60
    return hour * 60 + minute


def _clock(value: int) -> str:
    return f'{value // 60:02d}:{value % 60:02d}'


def _as_date(value: date | str) -> date:
    return value if isinstance(value, date) else date.fromisoformat(value)


def _date_for_weekday(today: date, weekday: int) -> date:
    distance = (weekday - today.weekday()) % 7
    return today + timedelta(days=distance)


def _next_working_day(closing_date: date, working_weekdays: list[int]) -> date:
    candidate = closing_date + timedelta(days=1)
    while candidate.weekday() not in working_weekdays:
        candidate += timedelta(days=1)
    return candidate


def _parse_deadline(text: str, planning_date: date) -> str | None:
    if re.search(r'今天(?:前|必须|务必)', text):
        return planning_date.isoformat()
    match = re.search(r'(?:(本|下)?周)([一二三四五六日天])(?:之前|前|截止|前完成)', text)
    if match:
        week_prefix, weekday_name = match.groups()
        weekday = WEEKDAY_NAMES[weekday_name]
        if week_prefix == '下':
            return (planning_date + timedelta(days=7 + weekday - planning_date.weekday())).isoformat()
        return (planning_date + timedelta(days=weekday - planning_date.weekday())).isoformat()
    match = re.search(r'(\d{1,2})月(\d{1,2})[日号]?(?:前|截止|前完成)', text)
    if match:
        month, day = map(int, match.groups())
        candidate = date(planning_date.year, month, day)
        if candidate < planning_date and (planning_date - candidate).days > 180:
            candidate = date(planning_date.year + 1, month, day)
        return candidate.isoformat()
    return None


def _parse_target_date(text: str, planning_date: date) -> str | None:
    if '今天' in text or '今晚' in text:
        return planning_date.isoformat()
    if '明天' in text:
        return (planning_date + timedelta(days=1)).isoformat()
    return None


def _parse_start(text: str) -> str | None:
    match = re.search(r'(?<!\d)(?:上午|下午|晚上|今晚)?\s*(\d{1,2}):(\d{2})(?!\d)', text)
    if not match:
        return None
    hour, minute = map(int, match.groups())
    prefix = text[max(0, match.start() - 3):match.start()]
    if ('下午' in prefix or '晚上' in prefix or '今晚' in prefix) and hour < 12:
        hour += 12
    return _clock(hour * 60 + minute)


def _parse_duration(text: str) -> int | None:
    match = re.search(r'(\d{1,3})\s*(?:分钟|min(?:ute)?s?)', text, re.I)
    return int(match.group(1)) if match else None


def _clean_title(text: str) -> str:
    title = re.sub(r'^(?:[-*•]|\d+[.、])\s*', '', text.strip())
    title = re.sub(r'(?:[本下]?周)[一二三四五六日天](?:之前|前|截止|前完成)', '', title)
    title = re.sub(r'\d{1,2}月\d{1,2}[日号]?(?:前|截止|前完成)', '', title)
    title = re.sub(r'(?:今天|明天|今晚|[本下]?周[一二三四五六日天])\s*', '', title)
    title = re.sub(r'(?:上午|下午|晚上|今晚)?\s*\d{1,2}:\d{2}(?:\s*[-—到至]\s*\d{1,2}:\d{2})?', '', title)
    title = re.sub(r'[（(]\s*\d{1,3}\s*(?:分钟|min(?:ute)?s?)\s*[)）]', '', title, flags=re.I)
    title = re.sub(r'\d{1,3}\s*(?:分钟|min(?:ute)?s?)', '', title, flags=re.I)
    return re.sub(r'\s+', ' ', title).strip(' ，,。；;：:')


def parse_typeless_text(text: str, planning_date: date | str) -> list[dict[str, Any]]:
    """Turn explicit Typeless sentences into editable task proposals.

    This is deliberately conservative: vague prose becomes an unscheduled task
    with an estimated duration instead of fabricated dates or commitments.
    """
    reference_date = _as_date(planning_date)
    lines = [line.strip() for line in re.split(r'[\n；;。]+', text) if line.strip()]
    tasks = []
    for sequence, line in enumerate(lines, start=1):
        is_study = bool(re.search(r'学习|阅读|课程|复盘|沉淀|小测|练习', line))
        duration = _parse_duration(line)
        inferred = duration is None
        tasks.append({
            'id': f'proposal-{sequence:02d}',
            'title': _clean_title(line) or line,
            'kind': 'study' if is_study else 'work',
            'duration_minutes': duration or (DEFAULT_POLICY['default_study_duration_minutes'] if is_study else DEFAULT_POLICY['default_work_duration_minutes']),
            'duration_source': 'explicit' if duration else 'estimated',
            'due_date': _parse_deadline(line, reference_date),
            'target_date': _parse_target_date(line, reference_date),
            'preferred_start': _parse_start(line),
            'priority': 'high' if re.search(r'紧急|必须|优先|今天.*(?:完成|发出)', line) else 'normal',
            'status': 'proposed',
            'schedule_state': 'unallocated',
            'carry_count': 0,
            'parse_note': '已估算时长，请编辑确认。' if inferred else None,
        })
    return tasks


def _is_free(start: int, end: int, occupied: list[tuple[int, int]]) -> bool:
    return all(end <= other_start or start >= other_end for other_start, other_end in occupied)


def _first_slot(windows: list[tuple[str, str]], duration: int, occupied: list[tuple[int, int]], preferred_start: str | None, granularity: int) -> tuple[int, int] | None:
    preferred_minutes = _minutes(preferred_start) if preferred_start else None
    candidates = [preferred_minutes] if preferred_minutes is not None else []
    for start_text, end_text in windows:
        start, end = _minutes(start_text), _minutes(end_text)
        candidate_start = max(start, preferred_minutes) if preferred_minutes is not None else start
        candidates.extend(range(candidate_start, end - duration + 1, granularity))
    checked = set()
    for start in candidates:
        if start in checked:
            continue
        checked.add(start)
        end = start + duration
        if any(start >= _minutes(window_start) and end <= _minutes(window_end) for window_start, window_end in windows) and _is_free(start, end, occupied):
            return start, end
    return None


def build_day_plan(tasks: list[dict[str, Any]], planning_date: date | str, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Allocate only eligible tasks within soft capacity; never mutate the input."""
    active_policy = {**DEFAULT_POLICY, **(policy or {})}
    day = _as_date(planning_date).isoformat()
    output = deepcopy(tasks)
    occupied = {'work': [], 'study': []}
    allocated = {'work': 0, 'study': 0}

    for task in output:
        task['scheduled_date'] = task.get('scheduled_date') or None
        task['scheduled_start'] = task.get('scheduled_start') or None
        task['scheduled_end'] = task.get('scheduled_end') or None
        task['schedule_state'] = task.get('schedule_state', 'unallocated')
        if task.get('scheduled_date') != day or not task.get('scheduled_start'):
            continue
        kind = task.get('kind', 'work')
        start, end = _minutes(task['scheduled_start']), _minutes(task['scheduled_end'])
        occupied[kind].append((start, end))
        if task.get('counts_towards_capacity', True):
            allocated[kind] += task['duration_minutes']

    ordering = {'high': 0, 'normal': 1, 'low': 2}
    candidates = [task for task in output if task.get('status') in {'proposed', 'todo'} and task.get('scheduled_date') != day]
    candidates.sort(key=lambda task: (ordering.get(task.get('priority', 'normal'), 1), task.get('due_date') or '9999-12-31', task['id']))

    for task in candidates:
        target_date = task.get('target_date')
        if target_date and target_date != day:
            task['schedule_state'] = 'awaiting_target_date'
            task['schedule_note'] = '保留到指定计划日期，不提前挤入今天。'
            continue
        kind = task.get('kind', 'work')
        capacity = active_policy[f'{kind}_soft_capacity_minutes']
        duration = task['duration_minutes']
        counts_towards_capacity = task.get('counts_towards_capacity', True)
        if counts_towards_capacity and allocated[kind] + duration > capacity:
            task['schedule_state'] = 'unallocated_soft_capacity'
            task['schedule_note'] = '保留缓冲时间；未自动挤压日程。'
            continue
        slot = _first_slot(active_policy[f'{kind}_windows'], duration, occupied[kind], task.get('preferred_start'), active_policy['slot_granularity_minutes'])
        if not slot:
            task['schedule_state'] = 'unallocated_no_slot'
            task['schedule_note'] = '可用时段不足，请手动调整。'
            continue
        start, end = slot
        task.update({
            'scheduled_date': day,
            'scheduled_start': _clock(start),
            'scheduled_end': _clock(end),
            'schedule_state': 'proposed',
            'schedule_note': '建议时间块，确认后才视为计划。',
        })
        occupied[kind].append(slot)
        if counts_towards_capacity:
            allocated[kind] += duration

    return {
        'planning_date': day,
        'policy': active_policy,
        'tasks': output,
        'load_minutes': allocated,
        'soft_capacity_minutes': {
            'work': active_policy['work_soft_capacity_minutes'],
            'study': active_policy['study_soft_capacity_minutes'],
        },
    }


def defer_incomplete_tasks(tasks: list[dict[str, Any]], completed_date: date | str, policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Carry movable incomplete items forward without changing their deadline."""
    active_policy = {**DEFAULT_POLICY, **(policy or {})}
    closing_date = _as_date(completed_date)
    next_date = _next_working_day(closing_date, active_policy['working_weekdays'])
    output = deepcopy(tasks)
    decisions = []
    for task in output:
        if task.get('scheduled_date') != closing_date.isoformat() or task.get('status') in {'done', 'cancelled'}:
            continue
        due_date = task.get('due_date')
        if task.get('time_lock'):
            task['schedule_state'] = 'needs_review_time_locked'
            decisions.append({'task_id': task['id'], 'action': 'needs_review', 'reason': 'time_locked'})
        elif due_date and date.fromisoformat(due_date) <= closing_date:
            task['schedule_state'] = 'needs_review_deadline'
            decisions.append({'task_id': task['id'], 'action': 'needs_review', 'reason': 'deadline_is_due_or_overdue'})
        elif task.get('carry_count', 0) >= active_policy['max_automatic_carries']:
            task['schedule_state'] = 'needs_review_carry_limit'
            decisions.append({'task_id': task['id'], 'action': 'needs_review', 'reason': 'carry_limit_reached'})
        else:
            task.update({
                'scheduled_date': next_date.isoformat(),
                'scheduled_start': None,
                'scheduled_end': None,
                'schedule_state': 'carry_proposed',
                'carry_count': task.get('carry_count', 0) + 1,
                'schedule_note': '未完成，已提议放入下一可用时段；DDL 保持不变。',
            })
            decisions.append({'task_id': task['id'], 'action': 'carry_proposed', 'from': closing_date.isoformat(), 'to': next_date.isoformat()})
    return {'completed_date': closing_date.isoformat(), 'next_planning_date': next_date.isoformat(), 'tasks': output, 'decisions': decisions}

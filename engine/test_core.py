import unittest

from engine.core import build_day_plan, defer_incomplete_tasks, parse_typeless_text


class PlanningEngineTests(unittest.TestCase):
    def test_explicit_typeless_input_becomes_editable_proposals(self):
        tasks = parse_typeless_text(
            '今天 10:30 Workflow 配置复核（90分钟）；下周四前发出 FAB Support follow-up，45分钟；今晚 20:30 阅读 AI Agent 文章（35分钟）',
            '2026-07-31',
        )
        self.assertEqual([task['kind'] for task in tasks], ['work', 'work', 'study'])
        self.assertEqual(tasks[0]['preferred_start'], '10:30')
        self.assertIsNone(tasks[0]['due_date'])
        self.assertEqual(tasks[0]['target_date'], '2026-07-31')
        self.assertEqual(tasks[1]['due_date'], '2026-08-06')
        self.assertEqual(tasks[2]['preferred_start'], '20:30')

    def test_plan_reserves_buffer_and_places_study_in_evening(self):
        tasks = parse_typeless_text(
            '今天 10:30 Workflow 配置复核（90分钟）；下周四前发出 FAB Support follow-up，45分钟；今晚 20:30 阅读 AI Agent 文章（35分钟）',
            '2026-07-31',
        )
        plan = build_day_plan(tasks, '2026-07-31')
        by_title = {task['title']: task for task in plan['tasks']}
        self.assertEqual(by_title['Workflow 配置复核']['scheduled_start'], '10:30')
        self.assertEqual(by_title['阅读 AI Agent 文章']['scheduled_start'], '20:30')
        self.assertEqual(plan['load_minutes'], {'work': 135, 'study': 35})

    def test_soft_capacity_leaves_overflow_unallocated(self):
        tasks = [
            {'id': f'work-{index}', 'title': f'工作块 {index}', 'kind': 'work', 'duration_minutes': 45, 'status': 'todo', 'priority': 'normal'}
            for index in range(1, 8)
        ]
        plan = build_day_plan(tasks, '2026-07-31')
        self.assertEqual(plan['load_minutes']['work'], 270)
        self.assertEqual(plan['tasks'][-1]['schedule_state'], 'unallocated_soft_capacity')

    def test_flexible_carry_does_not_change_deadline_or_move_due_task(self):
        tasks = [
            {'id': 'a', 'title': '可延后复核', 'kind': 'work', 'duration_minutes': 45, 'status': 'todo', 'scheduled_date': '2026-07-31', 'scheduled_start': '14:30', 'scheduled_end': '15:15', 'due_date': '2026-08-04', 'carry_count': 0},
            {'id': 'b', 'title': '今天必须发送', 'kind': 'work', 'duration_minutes': 30, 'status': 'todo', 'scheduled_date': '2026-07-31', 'scheduled_start': '15:30', 'scheduled_end': '16:00', 'due_date': '2026-07-31', 'carry_count': 0},
        ]
        result = defer_incomplete_tasks(tasks, '2026-07-31')
        by_id = {task['id']: task for task in result['tasks']}
        self.assertEqual(by_id['a']['scheduled_date'], '2026-08-03')
        self.assertEqual(by_id['a']['due_date'], '2026-08-04')
        self.assertEqual(by_id['b']['schedule_state'], 'needs_review_deadline')

    def test_friday_carry_moves_to_next_working_day(self):
        task = {'id': 'fri', 'title': '周五未完成', 'kind': 'work', 'duration_minutes': 45, 'status': 'todo', 'scheduled_date': '2026-07-31', 'scheduled_start': '16:00', 'scheduled_end': '16:45', 'carry_count': 0}
        result = defer_incomplete_tasks([task], '2026-07-31')
        self.assertEqual(result['next_planning_date'], '2026-08-03')
        self.assertEqual(result['tasks'][0]['scheduled_date'], '2026-08-03')

    def test_task_needing_duration_confirmation_is_not_scheduled(self):
        task = {'id': 'duration', 'title': '时长未知的视频', 'kind': 'study', 'duration_minutes': 90, 'status': 'needs_duration_confirmation', 'target_date': '2026-08-03'}
        plan = build_day_plan([task], '2026-08-03')
        self.assertIsNone(plan['tasks'][0]['scheduled_start'])
        self.assertEqual(plan['load_minutes']['study'], 0)

    def test_explicit_time_never_schedules_before_the_requested_start(self):
        tasks = [
            {'id': 'meeting', 'title': '已确定会议', 'kind': 'work', 'duration_minutes': 30, 'status': 'confirmed', 'scheduled_date': '2026-08-03', 'scheduled_start': '10:30', 'scheduled_end': '11:00'},
            {'id': 'plan', 'title': '项目更新', 'kind': 'work', 'duration_minutes': 45, 'status': 'todo', 'target_date': '2026-08-03', 'preferred_start': '10:30'},
        ]
        plan = build_day_plan(tasks, '2026-08-03')
        by_id = {task['id']: task for task in plan['tasks']}
        self.assertEqual(by_id['plan']['scheduled_start'], '11:00')

    def test_current_week_deadline_is_not_silently_moved_to_next_week(self):
        task = parse_typeless_text('周四前提交复核结果，45分钟', '2026-07-31')[0]
        self.assertEqual(task['due_date'], '2026-07-30')


if __name__ == '__main__':
    unittest.main()

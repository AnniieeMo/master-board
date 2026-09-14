"""Read-only adapter for events already visible in the macOS Calendar app."""

from __future__ import annotations

from datetime import date, datetime
import json
from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired, run
from typing import Callable


READER_PATH = Path(__file__).resolve().parent / 'connectors' / 'apple-calendar-readonly' / 'Apple Calendar Reader.swift'


class AppleCalendarError(ValueError):
    """Raised when macOS denies or cannot complete a Calendar read."""


def list_apple_calendar_events(
    start: datetime,
    end: datetime,
    runner: Callable[..., CompletedProcess[str]] = run,
) -> list[dict[str, str | bool]]:
    """Read EventKit events without creating, changing, or deleting any calendar data."""
    if end <= start:
        raise ValueError('end must be after start')
    if not READER_PATH.exists():
        raise AppleCalendarError('Apple Calendar reader is unavailable')
    try:
        result = runner(
            ['swift', str(READER_PATH), start.astimezone().isoformat(), end.astimezone().isoformat()],
            text=True,
            capture_output=True,
            check=False,
            timeout=60,
        )
    except TimeoutExpired as error:
        raise AppleCalendarError('Apple Calendar read timed out; try a smaller date range') from error
    except OSError as error:
        raise AppleCalendarError(f'Apple Calendar is unavailable: {error}') from error
    if result.returncode:
        message = (result.stderr or result.stdout or 'macOS did not allow Calendar access').strip()
        raise AppleCalendarError(f'Apple Calendar read failed: {message}')
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AppleCalendarError('Apple Calendar returned unreadable event data') from error
    if not isinstance(payload, list):
        raise AppleCalendarError('Apple Calendar returned an invalid event list')
    return [event for event in payload if isinstance(event, dict)]


def month_range(month: str) -> tuple[datetime, datetime]:
    """Return the requested ISO YYYY-MM month range."""
    try:
        first = date.fromisoformat(f'{month}-01')
    except ValueError as error:
        raise ValueError('month must use YYYY-MM') from error
    start = first.replace(day=1)
    if start.month == 12:
        next_month = date(start.year + 1, 1, 1)
    else:
        next_month = date(start.year, start.month + 1, 1)
    return datetime.combine(start, datetime.min.time()), datetime.combine(next_month, datetime.min.time())

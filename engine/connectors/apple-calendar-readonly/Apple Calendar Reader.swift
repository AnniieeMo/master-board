import EventKit
import Foundation

struct CalendarEvent: Encodable {
    let id: String
    let title: String
    let calendarName: String
    let scheduledDate: String
    let scheduledStart: String?
    let scheduledEnd: String?
    let endDate: String
    let allDay: Bool
    let kind = "meeting"
    let status = "confirmed"
    let source = "apple_calendar"
    let timeLock = true
    let countsTowardsCapacity = false

    enum CodingKeys: String, CodingKey {
        case id, title, kind, status, source
        case calendarName = "calendar_name"
        case scheduledDate = "scheduled_date"
        case scheduledStart = "scheduled_start"
        case scheduledEnd = "scheduled_end"
        case endDate = "end_date"
        case allDay = "all_day"
        case timeLock = "time_lock"
        case countsTowardsCapacity = "counts_towards_capacity"
    }
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    FileHandle.standardError.write(Data("Expected start and end ISO timestamps.\n".utf8))
    exit(2)
}

let inputFormatter = ISO8601DateFormatter()
guard let start = inputFormatter.date(from: arguments[1]), let end = inputFormatter.date(from: arguments[2]) else {
    FileHandle.standardError.write(Data("Invalid ISO timestamp.\n".utf8))
    exit(2)
}

let dayFormatter = DateFormatter()
dayFormatter.locale = Locale(identifier: "en_US_POSIX")
dayFormatter.timeZone = .current
dayFormatter.dateFormat = "yyyy-MM-dd"

let timeFormatter = DateFormatter()
timeFormatter.locale = Locale(identifier: "en_US_POSIX")
timeFormatter.timeZone = .current
timeFormatter.dateFormat = "HH:mm"

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var granted = false
var accessError: Error?

Task {
    do {
        if #available(macOS 14.0, *) {
            granted = try await store.requestFullAccessToEvents()
        } else {
            granted = try await withCheckedThrowingContinuation { continuation in
                store.requestAccess(to: .event) { success, error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume(returning: success) }
                }
            }
        }
    } catch {
        accessError = error
    }
    semaphore.signal()
}
semaphore.wait()

if let accessError {
    FileHandle.standardError.write(Data("Calendar permission failed: \(accessError.localizedDescription)\n".utf8))
    exit(1)
}
guard granted else {
    FileHandle.standardError.write(Data("Calendar permission was not granted.\n".utf8))
    exit(1)
}

let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let events = store.events(matching: predicate).filter { event in
    event.status != .canceled
}.map { event in
    CalendarEvent(
        id: "apple-\(event.eventIdentifier ?? UUID().uuidString)",
        title: event.title?.isEmpty == false ? event.title! : "(未命名会议)",
        calendarName: event.calendar.title,
        scheduledDate: dayFormatter.string(from: event.startDate),
        scheduledStart: event.isAllDay ? nil : timeFormatter.string(from: event.startDate),
        scheduledEnd: event.isAllDay ? nil : timeFormatter.string(from: event.endDate),
        endDate: dayFormatter.string(from: event.endDate),
        allDay: event.isAllDay
    )
}

do {
    let data = try JSONEncoder().encode(events)
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data("Could not encode Calendar events: \(error.localizedDescription)\n".utf8))
    exit(1)
}

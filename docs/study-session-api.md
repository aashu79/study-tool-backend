# Study Session API Reference

## Base
- Base path: `/api`
- Auth: `Authorization: Bearer <jwt>`
- Content type: `application/json`

## Enums

### `StudySessionStatus`
- `ACTIVE`
- `COMPLETED`
- `INCOMPLETE`

### `StudyEventType`
- `SESSION_STARTED`
- `SESSION_ENDED`
- `VIEW_SUMMARY`
- `OPEN_FLASHCARD`
- `START_QUIZ`
- `SUBMIT_QUIZ`
- `ANSWER_QUESTION`
- `CUSTOM_ACTIVITY`

### `DistractionType`
- `TAB_SWITCH`
- `WINDOW_BLUR`
- `INACTIVITY_TIMEOUT`
- `APP_BACKGROUND`
- `OTHER`

---

## 1) Start Study Session
`POST /api/study-sessions`

### Request body
```json
{
  "fileId": "string (required)",
  "sessionStart": "ISO datetime (optional)",
  "initialEventData": {
    "source": "study_page"
  }
}
```

### Success response (`201`)
```json
{
  "success": true,
  "message": "Study session started successfully",
  "data": {
    "id": "session_id",
    "userId": "user_id",
    "fileId": "file_id",
    "sessionStart": "2026-02-18T12:00:00.000Z",
    "sessionEnd": null,
    "status": "ACTIVE",
    "focusTimeSeconds": 0,
    "idleTimeSeconds": 0,
    "distractionCount": 0,
    "createdAt": "...",
    "updatedAt": "...",
    "file": {
      "id": "file_id",
      "filename": "sample.pdf",
      "mimetype": "application/pdf"
    },
    "summary": {
      "totalDurationSeconds": 0,
      "distractionRatioPercentage": 0,
      "focusScore": 0,
      "distractionCount": 0
    }
  }
}
```

---

## 2) List Study Sessions
`GET /api/study-sessions?page=1&limit=10&fileId=<id>&status=ACTIVE`

### Query params
- `page` (optional, default `1`)
- `limit` (optional, default `10`, max `50`)
- `fileId` (optional)
- `status` (optional: `ACTIVE | COMPLETED | INCOMPLETE`)

### Success response (`200`)
```json
{
  "success": true,
  "data": [
    {
      "id": "session_id",
      "status": "COMPLETED",
      "file": {
        "id": "file_id",
        "filename": "sample.pdf",
        "mimetype": "application/pdf"
      },
      "_count": {
        "events": 20,
        "distractions": 4,
        "quizAttempts": 2
      },
      "summary": {
        "totalDurationSeconds": 2400,
        "distractionRatioPercentage": 12.5,
        "focusScore": 87.5,
        "distractionCount": 4
      }
    }
  ],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 10,
    "totalPages": 2
  }
}
```

---

## 3) Get Active Session
`GET /api/study-sessions/active?fileId=<id>`

### Query params
- `fileId` (optional): return active session for a specific file

### Success response (`200`)
```json
{
  "success": true,
  "data": {
    "id": "session_id",
    "status": "ACTIVE",
    "fileId": "file_id",
    "summary": {
      "totalDurationSeconds": 0,
      "distractionRatioPercentage": 0,
      "focusScore": 0,
      "distractionCount": 0
    }
  }
}
```

`data` is `null` if no active session exists.

---

## 4) Get Session By ID
`GET /api/study-sessions/:sessionId?includeEvents=true&includeDistractions=true&includeQuizAttempts=true`

### Query params
- `includeEvents` (`true|false`, optional)
- `includeDistractions` (`true|false`, optional)
- `includeQuizAttempts` (`true|false`, optional)

### Success response (`200`)
```json
{
  "success": true,
  "data": {
    "id": "session_id",
    "status": "COMPLETED",
    "summary": {
      "totalDurationSeconds": 3000,
      "distractionRatioPercentage": 10,
      "focusScore": 90,
      "distractionCount": 3
    },
    "events": [],
    "distractions": [],
    "quizAttempts": []
  }
}
```

`events`, `distractions`, and `quizAttempts` are returned only when requested.

---

## 5) Log Study Activity Event
`POST /api/study-sessions/:sessionId/events`

### Request body
```json
{
  "eventType": "OPEN_FLASHCARD",
  "eventData": {
    "setId": "flashcard_set_id",
    "cardId": "card_id"
  },
  "timestamp": "ISO datetime (optional)"
}
```

### Success response (`201`)
```json
{
  "success": true,
  "message": "Study event logged successfully",
  "data": {
    "id": "event_id",
    "sessionId": "session_id",
    "eventType": "OPEN_FLASHCARD",
    "eventData": {
      "setId": "flashcard_set_id",
      "cardId": "card_id"
    },
    "timestamp": "2026-02-18T12:10:00.000Z"
  }
}
```

---

## 6) Log Distraction Event
`POST /api/study-sessions/:sessionId/distractions`

### Request body
```json
{
  "distractionType": "TAB_SWITCH",
  "durationSeconds": 18,
  "metadata": {
    "reason": "social_media"
  },
  "timestamp": "ISO datetime (optional)"
}
```

### Success response (`201`)
```json
{
  "success": true,
  "message": "Distraction event logged successfully",
  "data": {
    "event": {
      "id": "distraction_event_id",
      "sessionId": "session_id",
      "distractionType": "TAB_SWITCH",
      "durationSeconds": 18,
      "metadata": {
        "reason": "social_media"
      },
      "timestamp": "2026-02-18T12:20:00.000Z"
    },
    "sessionMetrics": {
      "id": "session_id",
      "distractionCount": 2,
      "idleTimeSeconds": 34,
      "focusTimeSeconds": 0
    }
  }
}
```

---

## 7) End Study Session
`PATCH /api/study-sessions/:sessionId/end`

### Request body
```json
{
  "status": "COMPLETED",
  "sessionEnd": "ISO datetime (optional)",
  "focusTimeSeconds": 1800,
  "idleTimeSeconds": 300
}
```

### Notes
- `status` defaults to `COMPLETED`.
- If `focusTimeSeconds` is omitted, backend derives it from session duration and idle time.
- Allowed `status` values here: `COMPLETED`, `INCOMPLETE`.

### Success response (`200`)
```json
{
  "success": true,
  "message": "Study session ended successfully",
  "data": {
    "id": "session_id",
    "status": "COMPLETED",
    "sessionStart": "...",
    "sessionEnd": "...",
    "focusTimeSeconds": 1800,
    "idleTimeSeconds": 300,
    "summary": {
      "totalDurationSeconds": 2100,
      "distractionRatioPercentage": 14.29,
      "focusScore": 85.71,
      "distractionCount": 4
    }
  }
}
```

---

## 8) Get Session Report
`GET /api/study-sessions/:sessionId/report`

### Success response (`200`)
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session_id",
      "fileId": "file_id",
      "fileName": "sample.pdf",
      "status": "COMPLETED",
      "sessionStart": "...",
      "sessionEnd": "...",
      "totalDurationSeconds": 2100,
      "focusTimeSeconds": 1800,
      "idleTimeSeconds": 300,
      "distractionCount": 4,
      "focusScore": 85.71,
      "distractionRatioPercentage": 14.29
    },
    "activity": {
      "totalEvents": 24,
      "breakdown": {
        "SESSION_STARTED": 1,
        "OPEN_FLASHCARD": 6,
        "VIEW_SUMMARY": 3,
        "SUBMIT_QUIZ": 2,
        "SESSION_ENDED": 1
      }
    },
    "distractions": {
      "totalEvents": 4,
      "totalDurationSeconds": 300,
      "breakdown": {
        "TAB_SWITCH": 3,
        "INACTIVITY_TIMEOUT": 1
      }
    },
    "quiz": {
      "totalAttempts": 2,
      "averagePercentage": 76.5,
      "bestPercentage": 83.33,
      "attempts": [
        {
          "attemptId": "attempt_id",
          "quizId": "quiz_id",
          "quizTitle": "Quiz title",
          "difficulty": "MEDIUM",
          "score": 8,
          "totalQuestions": 10,
          "correctAnswers": 8,
          "percentage": 80,
          "submittedAt": "..."
        }
      ]
    }
  }
}
```

---

## 9) Existing Quiz Submit Endpoint (Updated)
`POST /api/quiz/:quizId/submit`

### Request body (updated)
```json
{
  "sessionId": "optional_study_session_id",
  "answers": [
    {
      "questionId": "question_id",
      "selectedOptionIndex": 2
    }
  ]
}
```

### Integration behavior
- If `sessionId` is provided:
  - quiz attempt is saved with `quiz_attempts.sessionId`
  - a `SUBMIT_QUIZ` study event is logged for that session
- If `sessionId` is omitted:
  - quiz submission works exactly as before

---

## Error Response Structure
All endpoints return this structure on error:

```json
{
  "success": false,
  "error": "Error message"
}
```

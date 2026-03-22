# Trainerize API Documentation

Complete API reference for the ABC Trainerize Developer Hub. This document covers all API endpoints, webhooks, and integration details for building applications that connect with ABC Trainerize.

---

## Getting Started

### API and Webhook Access

Access to ABC Trainerize's API and webhooks is available to **Studio** and **Enterprise** customers. If you are interested in upgrading you can do so directly through your account or by visiting [www.trainerize.com](https://www.trainerize.com).

If you are looking to set up your access for the first time, want to register a webhook, or if you need to make an update please email [api@trainerize.com](mailto:api@trainerize.com).

### API Endpoint

```
https://api.trainerize.com/v03/
```

### Authentication Headers Scheme

Authentication is through the header.

**Permanent partner API token:**

Trainerize uses the Basic Authentication for permanent partner API. The Authentication token is base64 encoding of `groupID:APIToken`.

```
Authorization: Basic [Base64Encoded(groupID:APIToken)]
```

Please get the token from the Trainerize Dev Team.

### HTTP Status Response

Evaluate the actual HTTP status instead of JSON status codes.

| Code | Meaning |
|------|---------|
| 200 | Success |
| 401 | Unauthorized (auth creds not correct, cannot login) |
| 403 | Forbidden (client can only modify own records, trainer can modify group's records) |
| 404 | User or entity ID not found |
| 406 | Unable to parse params, or params don't make sense or give errors |
| 429 | The user has sent too many requests in a given amount of time (API Rate Limit) |
| 500 | Error occurred (any error or crashes) |

### Success Codes

| Code | Meaning |
|------|---------|
| 0 | Indicates success |

### API Rate Limit

Trainerize API enforces rate limits to ensure fair usage and maintain system stability. Rate limits are applied per Group API token and are enforced on a per-minute basis.

- **Requests:** 1000 requests per minute

#### Rate Limit Exceeded

If you exceed the API rate limit, you will receive a `429 Too Many Requests` status code with the "API Rate Limit Exceeded" message.

---

## API Endpoints

### accomplishment

#### POST /accomplishment/getList

**URL:** `https://api.trainerize.com/v03/accomplishment/getList`

Get a list of user accomplishment score

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/accomplishment/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673695,
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673695 |  |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| accomplishmentID | integer | Example: 123 |
| userID | integer | Example: 123 |
| dateTime | string | "[YYYY-MM-DD] [HH:MM:SS]", UTC datetime; Format: date; Example: 2019-11-01 12:12:12 |
| type | string | "brokenRecords", "hitWeightGoal", "hitTextGoal", "firstDailyWorkout", "cardioMilestone" |
| attachTo | integer | Example: 123 |
| brokenRecords | object |  |
| brokenRecords.dailyExerciseID | integer | Example: 5037564 |
| brokenRecords.exerciseID | integer | Example: 105190 |
| brokenRecords.exerciseName | string | Example: Exercise_ST1 |
| brokenRecords.recordType | string | Example: strength |
| brokenRecords.brokenRecordType | string | ForStrength, "oneRepMax, threeRepMax, fiveRepMax, tenRepMax, maxWeight, maxLoad", ForEndurancer,"maxReps",ForCardio,"maxSpeed, maxDistance",Forlongerbetter,"maxTime",Forfasterbetter,"minTime",Fortimedstrength,"maxLoadTimeWeight"; Example: maxLoad |
| brokenRecords.data | integer | Example: 16 |
| brokenRecords.dataChange | integer | Example: 7 |
| brokenRecords.unit | string | Example: lbs |
| brokenRecords.time | integer | time in seconds |
| brokenRecords.weight | integer | Example: 120 |
| brokenRecords.milestone | object |  |
| brokenRecords.milestone.type | string | "time", "distance" |
| brokenRecords.milestone.milestoneValue | integer | distance in user's distance unit, time in seconds; Example: 100 |
| brokenRecords.milestone.totalValue | integer | distance in user's distance unit, time in seconds; Example: 10 |
| hitWeightGoal | object |  |
| hitWeightGoal.bodyStatusID | integer | Example: 944405 |
| hitWeightGoal.currentWeight | number | Example: 246.4 |
| hitWeightGoal.goalWeight | number | Example: 242 |
| hitWeightGoal.startWeight | number | Example: 222.2 |
| hitTextGoal | object |  |
| hitTextGoal.goalText | string | Example: xxxxx |
| firstDailyWorkout | object |  |
| firstDailyWorkout.dailyWorkoutID | integer | Example: 123 |
| firstDailyWorkout.name | string | Example: Workout 1 |
| cardioMilestone | object |  |
| cardioMilestone.habitStatsID | integer | Example: 123 |
| cardioMilestone.name | string | Example: habits1 |
| cardioMilestone.streak | integer | Example: 10 |
| cardioMilestone.habitType | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 500 | General server error |

---

#### POST /accomplishment/getStatsList

**URL:** `https://api.trainerize.com/v03/accomplishment/getStatsList`

Get a list of user stats

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/accomplishment/getStatsList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673695,
  "category": "goalHabit",
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673695 |  |
| category | string | No |  | "goalHabit", "workoutBrokenRecord", "workoutMilestone", "cardioBrokenRecord", "cardioMilestone" |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer | Total records; Example: 10 |
| stats | array |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 500 | General server error |

---

### appStore

#### POST /appStore/verifyUserToken

**URL:** `https://api.trainerize.com/v03/appStore/verifyUserToken`

Verify if user token is valid

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/appStore/verifyUserToken \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673671,
  "extensionID": 123,
  "token": "xxx"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673671 |  |
| extensionID | integer | Yes | 123 |  |
| token | string | Yes | xxx |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | 1: Token verified successfully; 2: Invalid token |
| message | string | Response message |

**Error Codes**

| Code | Message |
|------|---------|
| 406 | Invalid data |

---

### appointment

#### POST /appointment/add

**URL:** `https://api.trainerize.com/v03/appointment/add`

Add an appointment

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/appointment/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "startDate": "",
  "endDate": "",
  "appointmentTypeID": 0,
  "notes": "",
  "recurrenceRoot": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes |  | Trainer's userid |
| startDate | string | Yes |  | Datetime in UTC; Format: date-time |
| endDate | string | Yes |  | Datetime in UTC; Format: date-time |
| appointmentTypeID | integer | Yes |  |  |
| notes | string | No |  |  |
| actionInfo | object | No |  |  |
| actionInfo.isVideoCall | boolean | No |  |  |
| isRecurring | boolean | No |  |  |
| recurrenceRoot | integer | No |  | After saving root appointment, pass in its ID as the recurrenceRoot for the following appointments in the series |
| recurrencePattern | object | No |  | Necessary for root appointment's notification |
| recurrencePattern.frequency | string | No |  | weekly, monthly |
| recurrencePattern.duration | integer | No |  | The total duration of the pattern in weeks or months |
| recurrencePattern.totalCount | integer | No |  | The total number of appointments added |
| recurrencePattern.repeatWeekly | object | No |  |  |
| recurrencePattern.repeatWeekly.every | integer | No |  | Occurrence is every n number of weeks |
| recurrencePattern.repeatWeekly.weekDays | array[string] | No |  | ["monday", "friday"] Which  days of the week to schedule on |
| recurrencePattern.repeatMonthly | object | No |  |  |
| recurrencePattern.repeatMonthly.mode | string | No |  | If "onDay", occurs on certain day of month; if "onWeekDay", occurs on specific weekday on first/last week of month |
| recurrencePattern.repeatMonthly.every | string | No |  | "first", In "onWeekDay" mode, "first" means it occurs in first week of month |
| recurrencePattern.repeatMonthly.onDay | integer | No |  | Occurs on specific day of month |
| recurrencePattern.repeatMonthly.weekday | string | No |  | Occurs on specific day of week in the month |
| attendents | array[object] | No |  |  |
| attendents[].userID | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Appointment ID |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 403 | No privilege |
| 500 | Server error |

---

#### POST /appointment/getAppointmentTypeList

**URL:** `https://api.trainerize.com/v03/appointment/getAppointmentTypeList`

Get the appointment types for the group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/appointment/getAppointmentTypeList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |
| filter | object | No |  |  |
| filter.ignoreDeleted | boolean | No |  | If true, deleted appointment types won't be counted or returned in the result |
| filter.ignoreVideoCall | boolean | No |  | If true, appointment types with video calls won't be counted or returned in the result |
| filter.ignoreExternal | boolean | No |  | If true, external appointment types won't be counted or returned in the result |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer | Example: 20 |
| appointmentTypes | array[object] |  |
| appointmentTypes[].appointmentTypeID | integer | Example: 123 |
| appointmentTypes[].name | string | Example: xxx |
| appointmentTypes[].duration | integer | Example: 60 |
| appointmentTypes[].numberOfAttendees | integer | Example: 22 |
| appointmentTypes[].actionInfo | object |  |
| appointmentTypes[].actionInfo.isVideoCall | boolean | Example: True |
| appointmentTypes[].isGroupAppointment | boolean | true/false -- For now, only true for legacy "Group Training" appointment type |
| appointmentTypes[].isActive | boolean | true/false -- If false, appointment type is deleted and should no longer be used for scheduling new appointments |
| appointmentTypes[].appointmentSource | string | "trainerize", "abc", "mbo" |
| appointmentTypes[].externalID | integer | Integer, Null if not from an external source |
| appointmentTypes[].externalApplicationID | integer | Integer, Null if not from an external application; Example: 123 |
| appointmentTypes[].isPaidSession | boolean | true/false |
| appointmentTypes[].allowSelfRecharge | boolean | true/false |
| appointmentTypes[].selfCancelHours | string | 1, 2, 6, 12, 24, 48 -- Allow cancel up to n hours before appointment |
| appointmentTypes[].isPrivate | boolean | Whether appointment is bookable by client (false by default); Example: false |
| appointmentTypes[].isVirtual | boolean | Virtual appointments are not tied to a location |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not privilege |

---

#### POST /appointment/getList

**URL:** `https://api.trainerize.com/v03/appointment/getList`

Get the appointment based on user and date

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/appointment/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "startDate": "2020-10-01 12:32:12",
  "endDate": "2020-10-01 12:32:12"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| startDate | string | No | 2020-10-01 12:32:12 | Datetime in UTC; Format: date-time |
| endDate | string | No | 2020-10-01 12:32:12 | Datetime in UTC; Format: date-time |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| appointments | array[object] |  |
| appointments[].id | integer | appointment ID; Example: 123 |
| appointments[].type | string | Old appointment type for backwards-compatibility [DO NOT USE] - "initialConsultation", "goalSettingSession", "privatePersonalTraining", "smallGroupTraining"; Example: privatePersonalTraining |
| appointments[].userID | integer | trainer ID; Example: 123 |
| appointments[].startDate | string | Datetime in UTC; Format: date-time; Example: 2020-10-01 12:32:12 |
| appointments[].endDate | string | Datetime in UTC; Format: date-time; Example: 2020-10-01 12:32:12 |
| appointments[].startDateTime | string | Datetime in LocalTime [DO NOT USE]; Format: date-time; Example: 2020-10-01 12:32:12 |
| appointments[].endDateTime | string | Datetime in LocalTime [DO NOT USE]; Format: date-time; Example: 2020-10-01 12:32:12 |
| appointments[].allowCancelBeforeDate | string | (or null), Datetime in UTC; Format: date-time; Example: 2015-12-30 11:12:12 |
| appointments[].appointmentType | object |  |
| appointments[].appointmentType.appointmentTypeID | integer | Example: 123 |
| appointments[].appointmentType.name | string | Example: xxx |
| appointments[].appointmentType.duration | integer | Example: 60 |
| appointments[].appointmentType.numberOfAttendees | integer | Example: 22 |
| appointments[].appointmentType.actionInfo | object |  |
| appointments[].appointmentType.actionInfo.isVideoCall | boolean | Example: True |
| appointments[].appointmentType.isGroupAppointment | boolean | true/false -- For now, only true for legacy "Group Training" appointment type |
| appointments[].appointmentType.isActive | boolean | true/false -- If false, appointment type is deleted and should no longer be used for scheduling new appointments |
| appointments[].appointmentType.appointmentSource | string | "trainerize", "abc", "mbo" |
| appointments[].appointmentType.externalID | integer | Integer, Null if not from an external source |
| appointments[].appointmentType.externalApplicationID | integer | Integer, Null if not from an external application; Example: 123 |
| appointments[].appointmentType.isPaidSession | boolean | true/false |
| appointments[].appointmentType.allowSelfRecharge | boolean | true/false |
| appointments[].appointmentType.selfCancelHours | string | 1, 2, 6, 12, 24, 48 -- Allow cancel up to n hours before appointment |
| appointments[].appointmentType.isPrivate | boolean | Whether appointment is bookable by client (false by default); Example: false |
| appointments[].appointmentType.isVirtual | boolean | Virtual appointments are not tied to a location |
| appointments[].notes | string | Example: xxx |
| appointments[].actionInfo | object |  |
| appointments[].actionInfo.isVideoCall | boolean |  |
| appointments[].isRecurring | boolean |  |
| appointments[].recurrenceRoot | integer | Will be null if not recurring or its the root appointment; Example: 123 |
| appointments[].attendentsCount | integer |  |
| appointments[].organizer | object |  |
| appointments[].organizer.id | integer | User ID; Example: 123 |
| appointments[].organizer.exernalID | string | Example: asda9a78sd98a7s |
| appointments[].organizer.firstName | string | Example: abc |
| appointments[].organizer.lastName | string | Example: def |
| appointments[].organizer.email | string | Example: xyz@trainerize.com |
| appointments[].organizer.profileIconUrl | string | Example: xxx |
| appointments[].organizer.type | string | client, trainer |
| appointments[].organizer.checkedIn | boolean | [For "client" type attendent] Whether client is checked into class; curently only used by ABC classes |
| appointments[].organizer.timeOfLastCheckIn | string | [For "client" type attendent] Time of last client check-in; curently only used by ABC classes; Format: date-time; Example: 2015-12-30 11:12:12 |
| appointments[].organizer.cancellationStatus | string | "unrequested", "requested", "denied" -- The status of the client's cancellation request, if requested. For trainer, it is always "unrequested"; Example: unrequested |
| appointments[].appointmentSource | string | trainerize, abc, mbo |
| appointments[].externalID | integer | null if not from an external source |
| appointments[].isSelfBooked | boolean | Whether the appointment was self booked by the client |
| appointments[].locationID | integer | Example: 123 |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not privilege |

---

#### POST /appointment/getAppointmentType

**URL:** `https://api.trainerize.com/v03/appointment/getAppointmentType`

Get the appointment type

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/appointment/getAppointmentType \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "getAppointmentType": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| getAppointmentType | integer | No | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| appointments | array[object] |  |
| appointments[].appointmentTypeID | integer | Example: 123 |
| appointments[].name | string | Example: xxx |
| appointments[].duration | integer | Example: 60 |
| appointments[].numberOfAttendees | integer | Example: 22 |
| appointments[].actionInfo | object |  |
| appointments[].actionInfo.isVideoCall | boolean | Example: True |
| appointments[].isGroupAppointment | boolean | true/false -- For now, only true for legacy "Group Training" appointment type |
| appointments[].isActive | boolean | true/false -- If false, appointment type is deleted and should no longer be used for scheduling new appointments |
| appointments[].appointmentSource | string | "trainerize", "abc", "mbo" |
| appointments[].externalID | integer | Integer, Null if not from an external source |
| appointments[].externalApplicationID | integer | Integer, Null if not from an external application; Example: 123 |
| appointments[].isPaidSession | boolean | true/false |
| appointments[].allowSelfRecharge | boolean | true/false |
| appointments[].selfCancelHours | string | 1, 2, 6, 12, 24, 48 -- Allow cancel up to n hours before appointment |
| appointments[].isPrivate | boolean | Whether appointment is bookable by client (false by default); Example: false |
| appointments[].isVirtual | boolean | Virtual appointments are not tied to a location |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not privilege |

---

### bodystats

#### POST /bodystats/add

**URL:** `https://api.trainerize.com/v03/bodystats/add`

add a bodystats

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/bodystats/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": "673695",
  "date": "2020-01-01",
  "status": "scheduled"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 673695 |  |
| date | string | No | 2020-01-01 | [YYYY-MM-DD]; Format: date |
| status | string | No | scheduled |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | dailybodystatus id |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 406 | User can only has one bodystats a day. |
| 500 | General server error |

---

#### POST /bodystats/delete

**URL:** `https://api.trainerize.com/v03/bodystats/delete`

Deletes the bodystat

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/bodystats/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": "673695",
  "date": "2020-01-01"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | bodystatus id  |
| userID | integer | No | 673695 |  |
| date | string | No | 2020-01-01 | [YYYY-MM-DD]; Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| bodyMeasures | object |  |
| bodyMeasures.date | string | YYYY-MM-DD; Format: date |
| bodyMeasures.bodyWeight | integer |  |
| bodyMeasures.bodyFatPercent | number |  |
| bodyMeasures.leanBodyMass | number |  |
| bodyMeasures.fatMass | number |  |
| bodyMeasures.chest | number |  |
| bodyMeasures.shoulders | number |  |
| bodyMeasures.rightBicep | number |  |
| bodyMeasures.leftBicep | number |  |
| bodyMeasures.rightForearm | number |  |
| bodyMeasures.leftForearm | number |  |
| bodyMeasures.rightThigh | number |  |
| bodyMeasures.leftThigh | number |  |
| bodyMeasures.rightCalf | number |  |
| bodyMeasures.leftCalf | number |  |
| bodyMeasures.waist | number |  |
| bodyMeasures.hips | number |  |
| bodyMeasures.neck | number |  |
| bodyMeasures.bloodPressureDiastolic | integer |  |
| bodyMeasures.bloodPressureSystolic | integer |  |
| bodyMeasures.caliperBF | number |  |
| bodyMeasures.caliperMode | string | Format: byte |
| bodyMeasures.caliperChest | number |  |
| bodyMeasures.caliperTriceps | number |  |
| bodyMeasures.caliperSubscapular | number |  |
| bodyMeasures.caliperAxilla | number |  |
| bodyMeasures.caliperAbdomen | number |  |
| code | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /bodystats/get

**URL:** `https://api.trainerize.com/v03/bodystats/get`

Get bodystat for userid

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/bodystats/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": "673695",
  "date": "2020-01-01",
  "unitBodystats": "inches",
  "unitWeight": "lbs"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673695 |  |
| date | string | No | 2020-01-01 | [YYYY-MM-DD] "2015-01-26" (no timezone, grabs the date)  \| “last” (grabs the last body stat entry); Format: date |
| unitBodystats | string | No | inches | cm, inches |
| unitWeight | string | No | lbs | kb, lbs |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | bodystatus id |
| status | string | scheduled, tracked |
| from | string | trainerize, fitbit, withings |
| fromProgram | boolean |  |
| bodyMeasures | object |  |
| bodyMeasures.date | string | YYYY-MM-DD; Format: date |
| bodyMeasures.bodyWeight | integer |  |
| bodyMeasures.bodyFatPercent | number |  |
| bodyMeasures.leanBodyMass | number |  |
| bodyMeasures.fatMass | number |  |
| bodyMeasures.chest | number |  |
| bodyMeasures.shoulders | number |  |
| bodyMeasures.rightBicep | number |  |
| bodyMeasures.leftBicep | number |  |
| bodyMeasures.rightForearm | number |  |
| bodyMeasures.leftForearm | number |  |
| bodyMeasures.rightThigh | number |  |
| bodyMeasures.leftThigh | number |  |
| bodyMeasures.rightCalf | number |  |
| bodyMeasures.leftCalf | number |  |
| bodyMeasures.waist | number |  |
| bodyMeasures.hips | number |  |
| bodyMeasures.neck | number |  |
| bodyMeasures.bloodPressureDiastolic | integer |  |
| bodyMeasures.bloodPressureSystolic | integer |  |
| bodyMeasures.caliperBF | number |  |
| bodyMeasures.caliperMode | string | Format: byte |
| bodyMeasures.caliperChest | number |  |
| bodyMeasures.caliperTriceps | number |  |
| bodyMeasures.caliperSubscapular | number |  |
| bodyMeasures.caliperAxilla | number |  |
| bodyMeasures.caliperAbdomen | number |  |
| code | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 406 | Missing date field ;When date missing or cannot be parsed |
| 412 | No entry on the date |
| 500 | General server error |

---

#### POST /bodystats/set

**URL:** `https://api.trainerize.com/v03/bodystats/set`

Save bodystat for userID

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/bodystats/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userid": 494788,
  "date": "2015-05-22",
  "unitWeight": 0,
  "unitBodystats": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userid | integer | No | 494788 |  |
| date | string | No | 2015-05-22 | [YYYY-MM-DD]; Format: date |
| unitWeight | integer | No |  | kg |
| unitBodystats | integer | No |  | cm |
| bodyMeasures | object | No |  |  |
| bodyMeasures.bodyWeight | integer | No |  |  |
| bodyMeasures.bodyFatPercent | number | No |  |  |
| bodyMeasures.chest | number | No |  |  |
| bodyMeasures.shoulders | number | No |  |  |
| bodyMeasures.rightBicep | number | No |  |  |
| bodyMeasures.leftBicep | number | No |  |  |
| bodyMeasures.rightForearm | number | No |  |  |
| bodyMeasures.leftForearm | number | No |  |  |
| bodyMeasures.rightThigh | number | No |  |  |
| bodyMeasures.leftThigh | number | No |  |  |
| bodyMeasures.rightCalf | number | No |  |  |
| bodyMeasures.leftCalf | number | No |  |  |
| bodyMeasures.waist | number | No |  |  |
| bodyMeasures.hips | number | No |  |  |
| bodyMeasures.neck | number | No |  |  |
| bodyMeasures.restingHeartRate | number | No |  |  |
| bodyMeasures.bloodPressureSystolic | integer | No |  |  |
| bodyMeasures.bloodPressureDiastolic | integer | No |  |  |
| bodyMeasures.caliperMode | string | No |  | Format: byte |
| bodyMeasures.caliperChest | number | No |  |  |
| bodyMeasures.caliperTriceps | number | No |  |  |
| bodyMeasures.caliperSubscapular | number | No |  |  |
| bodyMeasures.caliperAxilla | number | No |  |  |
| bodyMeasures.caliperSuprailiac | number | No |  |  |
| bodyMeasures.caliperAbdomen | number | No |  |  |
| bodyMeasures.caliperThigh | number | No |  |  |
| bodyMeasures.caliperBF | number | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| bodyMeasures | object |  |
| bodyMeasures.date | string | YYYY-MM-DD; Format: date |
| bodyMeasures.bodyWeight | integer |  |
| bodyMeasures.bodyFatPercent | number |  |
| bodyMeasures.leanBodyMass | number |  |
| bodyMeasures.fatMass | number |  |
| bodyMeasures.chest | number |  |
| bodyMeasures.shoulders | number |  |
| bodyMeasures.rightBicep | number |  |
| bodyMeasures.leftBicep | number |  |
| bodyMeasures.rightForearm | number |  |
| bodyMeasures.leftForearm | number |  |
| bodyMeasures.rightThigh | number |  |
| bodyMeasures.leftThigh | number |  |
| bodyMeasures.rightCalf | number |  |
| bodyMeasures.leftCalf | number |  |
| bodyMeasures.waist | number |  |
| bodyMeasures.hips | number |  |
| bodyMeasures.neck | number |  |
| bodyMeasures.bloodPressureDiastolic | integer |  |
| bodyMeasures.bloodPressureSystolic | integer |  |
| bodyMeasures.caliperBF | number |  |
| bodyMeasures.caliperMode | string | Format: byte |
| bodyMeasures.caliperChest | number |  |
| bodyMeasures.caliperTriceps | number |  |
| bodyMeasures.caliperSubscapular | number |  |
| bodyMeasures.caliperAxilla | number |  |
| bodyMeasures.caliperAbdomen | number |  |
| code | integer | Example: 0 |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not found |
| 406 | User can only has one bodystats a day. |
| 412 | Missing date field; When date missing or cannot be parsed |
| 500 | General server error |

---

### calendar

#### POST /calendar/getList

**URL:** `https://api.trainerize.com/v03/calendar/getList`

gets a list of all training plans

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/calendar/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673695,
  "startDate": "2020-01-01",
  "endDate": "2020-10-30",
  "unitDistance": "miles",
  "unitWeight": "lbs"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673695 |  |
| startDate | string | No | 2020-01-01 | [YYYY-MM-DD] "2015-01-26"; Format: date |
| endDate | string | No | 2020-10-30 | [YYYY-MM-DD] "2015-01-26"; Format: date |
| unitDistance | string | No | miles | km, miles |
| unitWeight | string | No | lbs | kb, lbs |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| calendar | array[object] |  |
| calendar[].type | string | workout, cardio, bodystat, photo, reminder, fms, dailyMessage |
| calendar[].id | integer |  |
| calendar[].title | string |  |
| calendar[].status | string | scheduled, checkedIn, tracked |
| calendar[].subtitle | string |  |
| calendar[].fromProgram | boolean |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 500 | General server error |

---

### challenge

#### POST /challenge/getList

**URL:** `https://api.trainerize.com/v03/challenge/getList`

Gets a list of challenges

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/challenge/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "view": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| view | string | No |  | mine, all |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| challenges | array[object] |  |
| challenges[].challengeID | number |  |
| challenges[].challengeName | string |  |
| challenges[].challengeDescription | string |  |
| challenges[].challengeType | string |  |
| challenges[].challengeStatus | string |  |
| challenges[].theme | string |  |
| challenges[].startDate | string |  |
| challenges[].endDate | string |  |
| challenges[].userCount | number |  |
| challenges[].singedInRole | string |  |
| challenges[].icon | object |  |
| challenges[].icon.id | number |  |
| challenges[].icon.userID | number |  |
| challenges[].icon.fileName | string |  |
| challenges[].icon.storageType | string |  |
| challenges[].icon.fileToken | string |  |
| challenges[].icon.contentType | string |  |
| challenges[].icon.attachType | string |  |
| challenges[].icon.attachTo | number |  |
| challenges[].icon.fileSize | number |  |
| challenges[].icon.created | string |  |
| challenges[].icon.metaData | string |  |
| challenges[].icon.MD5 | string |  |
| challenges[].challengeParticipant | object |  |
| challenges[].challengeParticipant.userID | number |  |
| challenges[].challengeParticipant.name | string |  |
| challenges[].challengeParticipant.points | number |  |
| challenges[].challengeParticipant.challengeRole | string |  |
| challenges[].challengeParticipant.dateJoined | string |  |
| challenges[].challengeParticipant.profileIconUrl | string |  |
| challenges[].challengeParticipant.level | number |  |
| challenges[].challengeParticipant.positionInRanking | number |  |
| challenges[].rules | object |  |
| challenges[].rules.cardioComplete | number |  |
| challenges[].rules.workoutComplete | number |  |
| challenges[].rules.habitComplete | number |  |
| challenges[].rules.hitPersonalbest | number |  |
| challenges[].rules.hitDailyNutritionGoal | number |  |
| challenges[].rules.hitAGoal | number |  |
| challenges[].rules.clubCheckIn | string |  |
| challenges[].rules.appointmentComplete | number |  |
| challenges[].rules.classComplete | number |  |
| challenges[].rules.completionThreshold | number |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | General server error |

---

#### POST /challenge/getLeaderboardParticipantList

**URL:** `https://api.trainerize.com/v03/challenge/getLeaderboardParticipantList`

Gets a list of participants in a challenge, ordered by points, grouped by ranks(same number of points) they belong to, with the current client as the center of the list. After the initial load the user can then scroll up and down the list and it will load users in that direction respectfuly. In Threshold challenge scenario, if the user clicks on a specific level/base it will limit the list to that level/base only.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/challenge/getLeaderboardParticipantList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "searchTerm": "",
  "reversed": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| challengeID | number | No |  |  |
| userID | number | No |  |  |
| searchTerm | string | No |  |  |
| reversed | string | No |  | true, false |
| start | number | No |  |  |
| count | number | No |  |  |
| preload | number | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| challenges | array[object] |  |
| challenges[].userID | number |  |
| challenges[].name | string |  |
| challenges[].points | number |  |
| challenges[].challengeRole | string |  |
| challenges[].dateJoined | string |  |
| challenges[].profileIconUrl | string |  |
| challenges[].level | number |  |
| challenges[].positionInRanking | number |  |
| total | number |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | General server error |

---

#### POST /challenge/getThresholdParticipantList

**URL:** `https://api.trainerize.com/v03/challenge/getThresholdParticipantList`

Gets participants list for a threshold challenge. Grouped By Levels/Bases with the ability to filter out participants of a certain level.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/challenge/getThresholdParticipantList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "searchTerm": "",
  "level": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| challengeID | number | No |  |  |
| searchTerm | string | No |  |  |
| level | string | No |  | level0, level1, level2, level3, level4 |
| start | number | No |  |  |
| count | number | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| challenges | array[object] |  |
| challenges[].userID | number |  |
| challenges[].name | string |  |
| challenges[].points | number |  |
| challenges[].challengeRole | string |  |
| challenges[].dateJoined | string |  |
| challenges[].profileIconUrl | string |  |
| challenges[].level | number |  |
| challenges[].positionInRanking | number |  |
| total | number |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | General server error |

---

#### POST /challenge/addParticipants

**URL:** `https://api.trainerize.com/v03/challenge/addParticipants`

Adds participants.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/challenge/addParticipants \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| challengeID | number | No |  |  |
| userIDs | array[number] | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| challenges | object |  |
| challenges.code | number |  |
| challenges.message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | General server error |

---

#### POST /challenge/removeParticipants

**URL:** `https://api.trainerize.com/v03/challenge/removeParticipants`

Removes participants.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/challenge/removeParticipants \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| challengeID | number | No |  |  |
| userIDs | array[number] | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| challenges | object |  |
| challenges.code | number |  |
| challenges.message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | General server error |

---

### compliance

#### POST /compliance/getGroupCompliance

**URL:** `https://api.trainerize.com/v03/compliance/getGroupCompliance`

gets a list of group compliances

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/compliance/getGroupCompliance \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "groupID": 0,
  "startDate": "",
  "endDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| groupID | integer | No |  |  |
| startDate | string | No |  | Format: date |
| endDate | string | No |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| startDate | string | Format: date |
| endDate | string | Format: date |
| cardioScheduled | integer | Trainer scheduled cardio |
| cardioCompleted | integer | Client completed trainer scheduled cardio |
| workoutScheduled | integer | Trainer scheduled workout |
| workoutCompleted | integer | Client completed trainer scheduled workout |
| workoutCompliance | integer | workout compliance in percentage |
| nutritionCompleted | integer | Client tracked nutrition compliance to nutrition goal |
| nutritionCompliance | integer | nutrition compliance |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 500 | General server error |

---

#### POST /compliance/getUserCompliance

**URL:** `https://api.trainerize.com/v03/compliance/getUserCompliance`

gets a list of user compliance score

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/compliance/getUserCompliance \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "startDate": "",
  "endDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| startDate | string | No |  | Format: date |
| endDate | string | No |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| startDate | string | Format: date |
| endDate | string | Format: date |
| cardioScheduled | integer | Trainer scheduled cardio |
| cardioCompleted | integer | Client completed trainer scheduled cardio |
| workoutScheduled | integer | Trainer scheduled workout |
| workoutCompleted | integer | Client completed trainer scheduled workout |
| workoutCompliance | integer | workout compliance in percentage |
| nutritionCompleted | integer | Client tracked nutrition compliance to nutrition goal |
| nutritionCompliance | integer | nutrition compliance |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 404 | User not found |
| 500 | General server error |

---

### dailyCardio

#### POST /dailyCardio/add

**URL:** `https://api.trainerize.com/v03/dailyCardio/add`

schedule a cardio workout

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyCardio/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 1234,
  "exerciseID": 123,
  "date": "2015-01-26",
  "target": "asdfsdf",
  "unitDistance": "km",
  "from": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 1234 | [long, user id, required] |
| exerciseID | integer | No | 123 | [int, cardio exercise id, required] |
| date | string | No | 2015-01-26 | [YYYY-MM-DD, date cardio exercise schedule, required]; Format: date |
| target | string | No | asdfsdf | [string, optional] |
| targetDetail | object | No |  |  |
| targetDetail.type | integer | No |  | [0 - none, 1 - distance, 2 - time, 10 - text, 20 - distance/zone, 30 - time/zone] |
| targetDetail.distance | integer | No | 123 |  |
| targetDetail.distanceUnit | string | No |  | "km", "miles" |
| targetDetail.time | integer | No | 456 |  |
| targetDetail.text | string | No |  | abc |
| targetDetail.zone | integer | No |  | 1-5 |
| unitDistance | string | No | km | "km" or "miles" |
| from | string | No |  | "garmin", "googleFit", "fitbit" |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | [long, cardio workoutid”]; Example: 123 |

---

#### POST /dailyCardio/get

**URL:** `https://api.trainerize.com/v03/dailyCardio/get`

get a cardio workout detail

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyCardio/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 1234,
  "userID": 123,
  "unitDistance": "km"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 1234 | [long, cardio  workout id , required] |
| userID | integer | No | 123 | client ID |
| unitDistance | string | No | km | string("km" or "miles") |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | [long]; Example: 123 |
| name | string | [string] |
| date | string | [string - YYYY-MM-DD] |
| startTime | string | [string - YYYY-MM-DD HH:MI:SS] |
| endTime | string | [string - YYYY-MM-DD HH:MI:SS] |
| workDuration | integer | duration in seconds, workout real worked duration; Example: 10 |
| from | string | [string] "garmin", "fitbit", "trainerize", "googleFit" |
| target | string | [string] target for this workout |
| targetDetail | object |  |
| targetDetail.type | integer | [0 - none, 1 - distance, 2 - time, 10 - text, 20 - distance/zone, 30 - time/zone] |
| targetDetail.distance | integer | Example: 123 |
| targetDetail.time | integer | Example: 456 |
| targetDetail.text | string | abc |
| targetDetail.zone | integer | 1-5 |
| exerciseID | integer | [int, exercise id]; Example: 123 |
| status | string | [string], "scheduled", "checkedIn", "tracked"; Example: scheduled |
| numberOfComments | integer | Example: 10 |
| notes | string | [string] |
| distance | number | Example: [decimal] |
| time | number | Example: [decimal] |
| calories | number | Example: [decimal] |
| activeCalories | number | Example: [decimal] |
| level | number | Example: [decimal] |
| speed | number | Example: [decimal] |
| maxHeartRate | integer |  |
| avgHeartRate | integer |  |
| location | string | "indoor", "outdoor", optional |
| dateUpdated | string | [Date - time]; Format: date-time; Example: 2015-05-01 01:01:55 |
| fromProgram | boolean | Example: False |

---

#### POST /dailyCardio/set

**URL:** `https://api.trainerize.com/v03/dailyCardio/set`

update a cardio workout

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyCardio/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 123,
  "userID": 123,
  "name": "abc",
  "date": "2015-05-01",
  "startTime": "",
  "endTime": "",
  "workDuration": 10,
  "target": "",
  "notes": "xxx",
  "status": "scheduled",
  "unitDistance": "km",
  "distance": 12.5,
  "time": 12.5,
  "calories": 12.5,
  "activeCalories": 11.5,
  "level": 12.5,
  "speed": 12.5,
  "maxHeartRate": 0,
  "avgHeartRate": 0,
  "location": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 123 | [long, cardio  workout id , required] |
| userID | integer | No | 123 | client ID |
| name | string | No | abc | [string, optional] |
| date | string | No | 2015-05-01 | [string - YYYY-MM-DD, optional]; Format: date |
| startTime | string | No |  | [string - YYYY-MM-DD HH:MI:SS]; Format: date-time |
| endTime | string | No |  | [string - YYYY-MM-DD HH:MI:SS]; Format: date-time |
| workDuration | integer | No | 10 | duration in seconds, workout real worked duration |
| target | string | No |  | [string] target for this workout |
| targetDetail | object | No |  |  |
| targetDetail.type | integer | No |  | [0 - none, 1 - distance, 2 - time, 10 - text, 20 - distance/zone, 30 - time/zone] |
| targetDetail.distance | integer | No | 123 |  |
| targetDetail.distanceUnit | string | No |  | "km", "miles" |
| targetDetail.time | number | No | 456 |  |
| targetDetail.text | string | No |  | abc |
| targetDetail.zone | integer | No |  | 1-5 |
| notes | string | No | xxx | [string, optional] |
| status | string | No | scheduled | [string, optional], "scheduled", "checkedIn", "tracked" |
| unitDistance | string | No | km | "km" or "miles" |
| distance | number | No | 12.5 | [decimal - optional] |
| time | number | No | 12.5 | [decimal - optional in seconds] |
| calories | number | No | 12.5 | [decimal - optional] |
| activeCalories | number | No | 11.5 | [decimal - optional] |
| level | number | No | 12.5 | [decimal - optional] |
| speed | number | No | 12.5 | [decimal - optional] |
| maxHeartRate | integer | No |  |  |
| avgHeartRate | integer | No |  |  |
| location | string | No |  | "indoor", "outdoor", optional |
| comments | array[object] | No |  | Workout Comment -- Only send comment and RPE, for the first time user complete the workout |
| comments[].comment | string | No | abc |  |
| comments[].rpe | integer | No |  | [int] -- RPE |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| message | string | Cardio workout updated. |
| milestone | object |  |
| milestone.type | string | "time", "distance" |
| milestone.exerciseID | integer | Example: 1234 |
| milestone.milestoneValue | integer | current milestone value, distance in user's distance unit, time in seconds; Example: 100 |
| milestone.nextMilestoneValue | integer | next milestone value, distance in user's distance unit, time in seconds; Example: 200 |
| milestone.totalValue | integer | distance in user's distance unit, time in seconds; Example: 10 |
| brokenRecords | array[object] |  |
| brokenRecords[].dailyExerciseID | integer | Example: 10282588 |
| brokenRecords[].exerciseID | integer | Example: 154 |
| brokenRecords[].name | string | Example: abc |
| brokenRecords[].recordType | string | Example: strength |
| brokenRecords[].bestStats | object | For Cardio - Possible parameters - "maxSpeed", "maxSpeedIncrease", "maxDistance", "maxDistanceIncrease" |

---

### dailyNutrition

#### POST /dailyNutrition/getList

**URL:** `https://api.trainerize.com/v03/dailyNutrition/getList`

Get Nutrition by user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "startDate": "",
  "endDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| startDate | string | No |  | datetime: YYYY-MM-DD HH:MI:SS |
| endDate | string | No |  | datetime: YYYY-MM-DD HH:MI:SS |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| nutrition | array[object] |  |
| nutrition[].id | integer |  |
| nutrition[].date | string | date: YYYY-MM-DD |
| nutrition[].source | string | fitbit, mFP, trainerize |
| nutrition[].calories | number |  |
| nutrition[].carbsGrams | number |  |
| nutrition[].carbsPercent | number |  |
| nutrition[].proteinGrams | number |  |
| nutrition[].proteinPercent | number |  |
| nutrition[].fatGrams | number |  |
| nutrition[].fatPercent | number |  |
| nutrition[].fiberGrams | number |  |
| nutrition[].sodiumGrams | number |  |
| nutrition[].sugarGrams | number |  |
| nutrition[].meals | array[object] |  |
| nutrition[].meals[].name | string | breakfast, morningSnack, lunch, afternoonSnack, dinner, afterDinner, anytime |
| nutrition[].meals[].mealGuid | string |  |
| nutrition[].meals[].mealTime | string | datetime: YYYY-MM-DD HH:MI:SS |
| nutrition[].meals[].hasImage | boolean |  |
| nutrition[].meals[].modifiedAt | string | datetime: YYYY-MM-DD HH:MI:SS -- List view won't include the description and food details, please call get API to get full view |
| nutrition[].goal | object |  |
| nutrition[].goal.nutritionDeviation | number | 10% |
| nutrition[].goal.caloricGoal | number |  |
| nutrition[].goal.carbsGrams | number |  |
| nutrition[].goal.proteinGrams | number |  |
| nutrition[].goal.fatGrams | number |  |
| nutrition[].mealPhoto | object |  |
| nutrition[].mealPhoto.id | integer |  |

---

#### POST /dailyNutrition/get

**URL:** `https://api.trainerize.com/v03/dailyNutrition/get`

Get Nutrition by User and Date

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0,
  "date": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | dailyNutrition ID |
| userID | integer | No |  | [long], required |
| date | string | No |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| nutrition | object |  |
| nutrition.id | integer |  |
| nutrition.date | string | date: YYYY-MM-DD |
| nutrition.numberOfComments | integer |  |
| nutrition.source | string | fitbit, mFP, trainerize |
| nutrition.calories | number |  |
| nutrition.carbsGrams | number |  |
| nutrition.carbsPercent | number |  |
| nutrition.proteinGrams | number |  |
| nutrition.proteinPercent | number |  |
| nutrition.fatGrams | number |  |
| nutrition.fatPercent | number |  |
| nutrition.fiberGrams | number |  |
| nutrition.sodiumGrams | number |  |
| nutrition.sugarGrams | number |  |
| nutrition.nutrients | array[object] |  |
| nutrition.nutrients[].nutrNo | integer |  |
| nutrition.nutrients[].nutrVal | number |  |
| nutrition.meals | array[object] |  |
| nutrition.meals[].name | string | breakfast, morningSnack, lunch, afternoonSnack, dinner, afterDinner, anytime |
| nutrition.meals[].mealGuid | string |  |
| nutrition.meals[].mealTime | string | datetime: YYYY-MM-DD HH:MI:SS |
| nutrition.meals[].description | string |  |
| nutrition.meals[].hasImage | boolean |  |
| nutrition.meals[].modifiedAt | string | datetime: YYYY-MM-DD HH:MI:SS |
| nutrition.meals[].foods | array[object] |  |
| nutrition.meals[].foods[].name | string |  |
| nutrition.meals[].foods[].amount | integer |  |
| nutrition.meals[].foods[].unit | string |  |
| nutrition.meals[].foods[].calories | number |  |
| nutrition.meals[].foods[].proteins | number |  |
| nutrition.meals[].foods[].carbs | number |  |
| nutrition.meals[].foods[].fat | number |  |
| nutrition.meals[].foods[].imageId | integer |  |
| nutrition.meals[].foods[].type | string | custom, system |
| nutrition.meals[].foods[].convertedAmount | integer | can be null |
| nutrition.meals[].foods[].convertedUnit | string | can be null |
| nutrition.meals[].caloriesSummary | integer |  |
| nutrition.meals[].proteinSummary | integer |  |
| nutrition.meals[].fatSummary | integer |  |
| nutrition.meals[].carbsSummary | integer |  |
| nutrition.meals[].proteinPercent | number |  |
| nutrition.meals[].carbsPercent | number |  |
| nutrition.meals[].fatPercent | number |  |
| nutrition.goal | object |  |
| nutrition.goal.nutritionDeviation | number | 10% |
| nutrition.goal.caloricGoal | number |  |
| nutrition.goal.carbsGrams | number |  |
| nutrition.goal.proteinGrams | number |  |
| nutrition.goal.fatGrams | number |  |
| nutrition.mealPhoto | object |  |
| nutrition.mealPhoto.id | integer |  |

---

#### POST /dailyNutrition/getCustomFoodList

**URL:** `https://api.trainerize.com/v03/dailyNutrition/getCustomFoodList`

Get custom food list

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/getCustomFoodList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "groupID": 0,
  "searchTerm": "",
  "sort": "",
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  | Client ID, search by user |
| groupID | integer | No |  | For client level food |
| searchTerm | string | No |  |  |
| sort | string | No |  | lastModified, name, calories |
| start | integer | No |  |  |
| count | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| foods | array[object] |  |
| foods[].foodId | integer |  |
| foods[].type | string | system, custom |
| foods[].name | string |  |
| foods[].imageId | integer |  |
| foods[].userId | integer |  |
| foods[].groupId | integer |  |
| foods[].sampleServing | object |  |
| foods[].sampleServing.name | string |  |
| foods[].sampleServing.amount | integer |  |
| foods[].sampleServing.weight | number |  |
| foods[].sampleServing.calories | number |  |
| foods[].sampleServing.proteins | number |  |
| foods[].sampleServing.carbs | number |  |
| foods[].sampleServing.fat | number |  |
| foods[].serving | array[object] |  |
| foods[].serving[].name | string |  |
| foods[].serving[].amount | integer |  |
| foods[].serving[].weight | number |  |
| foods[].serving[].calories | number |  |
| foods[].serving[].proteins | number |  |
| foods[].serving[].carbs | number |  |
| foods[].serving[].fat | number |  |
| total | integer |  |

---

#### POST /dailyNutrition/addCustomFood

**URL:** `https://api.trainerize.com/v03/dailyNutrition/addCustomFood`

Add custom food

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/addCustomFood \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "groupId": 0,
  "userId": 0,
  "name": "",
  "barcode": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| groupId | integer | No |  | For group level food |
| userId | integer | No |  | For client level food |
| name | string | No |  |  |
| barcode | string | No |  | Barcode has to be unique within the group |
| serving | array[object] | No |  |  |
| serving[].name | string | No |  |  |
| serving[].amount | integer | No |  |  |
| serving[].nutrients | array[object] | No |  |  |
| serving[].nutrients[].nutrNo | integer | No |  |  |
| serving[].nutrients[].nutrVal | number | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| foodId | integer |  |
| code | integer |  |
| message | string |  |

---

#### POST /dailyNutrition/setCustomFood

**URL:** `https://api.trainerize.com/v03/dailyNutrition/setCustomFood`

Update custom food

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/setCustomFood \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "foodId": 0,
  "name": "",
  "barcode": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| foodId | integer | No |  |  |
| name | string | No |  |  |
| barcode | string | No |  | Barcode has to be unique within the group |
| serving | array[object] | No |  |  |
| serving[].name | string | No |  |  |
| serving[].amount | integer | No |  |  |
| serving[].weight | number | No |  |  |
| serving[].nutrients | array[object] | No |  |  |
| serving[].nutrients[].nutrNo | integer | No |  |  |
| serving[].nutrients[].nutrVal | number | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /dailyNutrition/deleteCustomFood

**URL:** `https://api.trainerize.com/v03/dailyNutrition/deleteCustomFood`

Delete custom food

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/deleteCustomFood \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "foodId": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  | Client ID |
| foodId | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /dailyNutrition/getMealTemplate

**URL:** `https://api.trainerize.com/v03/dailyNutrition/getMealTemplate`

Get meal template

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/getMealTemplate \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "mealTemplateId": 0,
  "multiplier": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| mealTemplateId | integer | No |  |  |
| multiplier | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| mealTemplateId | integer |  |
| templateType | string | user, goroup, system |
| userId | integer |  |
| groupId | integer |  |
| mealName | string |  |
| mealTypes | array[string] |  |
| description | string |  |
| caloriesSummary | integer |  |
| carbsSummary | integer |  |
| proteinSummary | integer |  |
| fatSummary | integer |  |
| carbsPercent | number |  |
| proteinPercent | number |  |
| fatPercent | number |  |
| nutrients | array[object] |  |
| nutrients[].nutrNo | integer |  |
| nutrients[].nutrVal | number |  |
| macroSplit | string | balanced, lowCarb, lowFat, highProtein |
| prepareTime | integer |  |
| cookTime | integer |  |
| recipeServingAmount | integer |  |
| cookInstruction | array[object] |  |
| cookInstruction[].text | string |  |
| foods | array[object] |  |
| foods[].name | string |  |
| foods[].amount | integer |  |
| foods[].unit | string |  |
| foods[].calories | number |  |
| foods[].proteins | number |  |
| foods[].carbs | number |  |
| foods[].fat | number |  |
| foods[].imageId | integer |  |
| foods[].type | string | custom, system |
| foods[].convertedAmount | integer | can be null |
| foods[].convertedUnit | string | can be null |
| includes | array[string] |  |
| tags | array[string] |  |
| isPublished | boolean |  |
| manualFoods | string |  |
| isManual | boolean |  |
| media | object |  |
| media.id | integer |  |
| media.modified | string | datetime: YYYY-MM-DD HH:MI:SS |
| media.type | string |  |
| media.status | string | queued, processing, ready, failed |
| media.duration | integer | in seconds |
| media.videoUrl | object |  |
| media.videoUrl.hls | string |  |
| media.videoUrl.hlssd | string |  |
| media.videoUrl.hlshd | string |  |
| media.thumbnailUrl | object |  |
| media.thumbnailUrl.hd | string |  |
| media.thumbnailUrl.sd | string |  |

---

#### POST /dailyNutrition/getMealTemplateList

**URL:** `https://api.trainerize.com/v03/dailyNutrition/getMealTemplateList`

Get meal template list

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/getMealTemplateList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userId": 0,
  "groupId": 0,
  "start": 0,
  "count": 0,
  "searchTerm": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userId | integer | No |  | Specify user id for saved meals |
| groupId | integer | No |  | Specify group id for meal library |
| start | integer | No |  |  |
| count | integer | No |  |  |
| searchTerm | string | No |  |  |
| filters | object | No |  |  |
| filters.templateTypes | array[string] | No |  | group, system, user |
| filters.mealTypes | array[string] | No |  | breakfast, lunch, dinner, snacks |
| filters.prepareTime | number | No |  | Up to n minutes |
| filters.excludes | array[string] | No |  | meat, fish, shellfish, soy, treeNuts, eggs, dairy, gluten, peanuts |
| filters.tags | array[string] | No |  | paleo, highFiber, onePot, slowCooker, salad, soup, smoothie, instantPot |
| filters.macroSplit | string | No |  | balanced, lowCarb, lowFat, highProtein |
| filters.calories | object | No |  |  |
| filters.calories.value | integer | No |  |  |
| filters.calories.multiplier | number | No |  |  |
| filters.status | array[string] | No |  | published, unpublished |
| filters.sort | string | No |  | lastModified, calories, name |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| mealTemplates | array[object] |  |
| mealTemplates[].mealTemplateId | integer |  |
| mealTemplates[].multiplier | integer |  |
| mealTemplates[].templateType | string | user, goroup, system |
| mealTemplates[].userId | integer |  |
| mealTemplates[].groupId | integer |  |
| mealTemplates[].mealName | string |  |
| mealTemplates[].mealTypes | array[string] |  |
| mealTemplates[].caloriesSummary | integer |  |
| mealTemplates[].carbsSummary | integer |  |
| mealTemplates[].proteinSummary | integer |  |
| mealTemplates[].fatSummary | integer |  |
| mealTemplates[].nutrients | array[object] |  |
| mealTemplates[].nutrients[].nutrNo | integer |  |
| mealTemplates[].nutrients[].nutrVal | number |  |
| mealTemplates[].macroSplit | string | balanced, lowCarb, lowFat, highProtein |
| mealTemplates[].prepareTime | integer |  |
| mealTemplates[].cookTime | integer |  |
| mealTemplates[].recipeServingAmount | integer |  |
| mealTemplates[].manualFoods | string |  |
| mealTemplates[].isManual | boolean |  |
| mealTemplates[].isPublished | boolean |  |
| mealTemplates[].media | object |  |
| mealTemplates[].media.id | integer |  |
| mealTemplates[].media.modified | string | datetime: YYYY-MM-DD HH:MI:SS |
| mealTemplates[].media.type | string |  |
| mealTemplates[].media.status | string | queued, processing, ready, failed |
| mealTemplates[].media.duration | integer | in seconds |
| mealTemplates[].media.videoUrl | object |  |
| mealTemplates[].media.videoUrl.hls | string |  |
| mealTemplates[].media.videoUrl.hlssd | string |  |
| mealTemplates[].media.videoUrl.hlshd | string |  |
| mealTemplates[].media.thumbnailUrl | object |  |
| mealTemplates[].media.thumbnailUrl.hd | string |  |
| mealTemplates[].media.thumbnailUrl.sd | string |  |
| total | integer |  |

---

#### POST /dailyNutrition/addMealTemplate

**URL:** `https://api.trainerize.com/v03/dailyNutrition/addMealTemplate`

Add meal template

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/addMealTemplate \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "templateType": "",
  "groupId": 0,
  "mealName": "",
  "description": "",
  "macroSplit": "",
  "prepareTime": 0,
  "cookTime": 0,
  "recipeServingAmount": 0,
  "manualFoods": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| templateType | string | No |  |  |
| groupId | integer | No |  |  |
| mealName | string | No |  |  |
| mealTypes | array[string] | No |  | breakfast, lunch, dinner, snacks |
| description | string | No |  |  |
| macroSplit | string | No |  | balanced, lowCarb, lowFat, highProtein |
| prepareTime | integer | No |  |  |
| cookTime | integer | No |  |  |
| recipeServingAmount | integer | No |  |  |
| cookInstruction | array[object] | No |  |  |
| cookInstruction[].text | string | No |  |  |
| foods | array[object] | No |  |  |
| foods[].foodId | integer | No |  |  |
| foods[].amount | integer | No |  |  |
| foods[].unit | string | No |  |  |
| includes | array[string] | No |  | meat, fish, shellfish, soy, treeNuts, eggs, dairy, gluten, peanuts |
| tags | array[string] | No |  | paleo, highFiber, onePot, slowCooker, salad, soup, smoothie, instantPot |
| manualFoods | string | No |  |  |
| isManual | boolean | No |  |  |
| isPublished | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| mealTemplateId | integer |  |

---

#### POST /dailyNutrition/setMealTemplate

**URL:** `https://api.trainerize.com/v03/dailyNutrition/setMealTemplate`

Set meal template

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/setMealTemplate \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "mealTemplateId": 0,
  "mealName": "",
  "description": "",
  "macroSplit": "",
  "prepareTime": 0,
  "cookTime": 0,
  "recipeServingAmount": 0,
  "manualFoods": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| mealTemplateId | integer | No |  |  |
| mealName | string | No |  |  |
| mealTypes | array[string] | No |  | breakfast, lunch, dinner, snacks |
| description | string | No |  |  |
| macroSplit | string | No |  | balanced, lowCarb, lowFat, highProtein |
| prepareTime | integer | No |  |  |
| cookTime | integer | No |  |  |
| recipeServingAmount | integer | No |  |  |
| cookInstruction | array[object] | No |  |  |
| cookInstruction[].text | string | No |  |  |
| foods | array[object] | No |  |  |
| foods[].foodId | integer | No |  |  |
| foods[].amount | integer | No |  |  |
| foods[].unit | string | No |  |  |
| tags | array[string] | No |  | paleo, highFiber, onePot, slowCooker, salad, soup, smoothie, instantPot |
| includes | array[string] | No |  | meat, fish, shellfish, soy, treeNuts, eggs, dairy, gluten, peanuts |
| manualFoods | string | No |  |  |
| isManual | boolean | No |  |  |
| isPublished | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /dailyNutrition/deleteMealTemplate

**URL:** `https://api.trainerize.com/v03/dailyNutrition/deleteMealTemplate`

Delete meal template

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyNutrition/deleteMealTemplate \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "mealTemplateId": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| mealTemplateId | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

### dailyWorkout

#### POST /dailyWorkout/get

**URL:** `https://api.trainerize.com/v03/dailyWorkout/get`

Get dailyWorkout detail

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyWorkout/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| ids | array | No |  | list of dailyworkout ids, required |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| statusMsg | string | Example: OK |
| dailyWorkouts | array[object] |  |
| dailyWorkouts[].id | integer | [int] |
| dailyWorkouts[].fromProgram | boolean | true/false; Example: true |
| dailyWorkouts[].name | string |  |
| dailyWorkouts[].date | string | [string, YYYY-MM-DD]; Format: date |
| dailyWorkouts[].startTime | string | [string], [YYYY-MM-DD] [HH:MM:SS]; Format: date |
| dailyWorkouts[].endTime | string | [string], [YYYY-MM-DD] [HH:MM:SS]; Format: date |
| dailyWorkouts[].duration | integer | integer, duration in seconds, workout estimated duration; Example: 10 |
| dailyWorkouts[].workDuration | integer | integer, duration in seconds, workout estimated duration; Example: 10 |
| dailyWorkouts[].type | string | string, "cardio", "workoutRegular", "workoutCircuit", "workoutTimed", "workoutInterval", "workoutVideo" |
| dailyWorkouts[].media | object |  |
| dailyWorkouts[].media.id | integer | [number] |
| dailyWorkouts[].media.type | string | [string], awss3 |
| dailyWorkouts[].media.status | string | string, "queued", "processing", "ready", "failed" |
| dailyWorkouts[].media.duration | integer | integer, duration in seconds; Example: 100 |
| dailyWorkouts[].media.usage | integer | integer, stream count |
| dailyWorkouts[].media.closeCaptionFileName | string | english.vtt |
| dailyWorkouts[].media.videoUrl | object |  |
| dailyWorkouts[].media.videoUrl.hls | string |  |
| dailyWorkouts[].media.videoUrl.hlssd | string |  |
| dailyWorkouts[].media.videoUrl.hlshd | string |  |
| dailyWorkouts[].media.thumbnailUrl | object |  |
| dailyWorkouts[].media.thumbnailUrl.hd | string |  |
| dailyWorkouts[].media.thumbnailUrl.sd | string |  |
| dailyWorkouts[].instructions | string | [string], instructions for this workout |
| dailyWorkouts[].hasOverride | boolean | bool, true/false; Example: true |
| dailyWorkouts[].status | string | string, "scheduled", "checkedIn", "tracked" |
| dailyWorkouts[].style | string | string, "normal", "freeStyle" |
| dailyWorkouts[].workoutID | integer | [long], the workout def id |
| dailyWorkouts[].notes | string | [string] |
| dailyWorkouts[].intervalProgress | integer | integer, workout progress in seconds; Example: 10 |
| dailyWorkouts[].numberOfComments | integer | Example: 10 |
| dailyWorkouts[].trackingStats | object |  |
| dailyWorkouts[].trackingStats.stats | object |  |
| dailyWorkouts[].trackingStats.stats.maxHeartRate | integer | [integer] |
| dailyWorkouts[].trackingStats.stats.avgHeartRate | integer | [integer] |
| dailyWorkouts[].trackingStats.stats.calories | number | [decimal] |
| dailyWorkouts[].trackingStats.stats.activeCalories | number | [decimal] |
| dailyWorkouts[].exercises | array[object] |  |
| dailyWorkouts[].exercises[].dailyExerciseID | integer | [long] |
| dailyWorkouts[].exercises[].def | object |  |
| dailyWorkouts[].exercises[].def.id | integer | [integer] |
| dailyWorkouts[].exercises[].def.name | string | [string] |
| dailyWorkouts[].exercises[].def.description | string | [string] |
| dailyWorkouts[].exercises[].def.sets | integer | [integer] |
| dailyWorkouts[].exercises[].def.target | string | [string] |
| dailyWorkouts[].exercises[].def.targetDetail | string | [string] |
| dailyWorkouts[].exercises[].def.side | string | [string], "left", "right" |
| dailyWorkouts[].exercises[].def.superSetID | integer | [int] |
| dailyWorkouts[].exercises[].def.supersetType | string | [string], "superset", "circuit", "none" |
| dailyWorkouts[].exercises[].def.intervalTime | integer | [integer] 0, (this is time allocated for this item, in seconds) |
| dailyWorkouts[].exercises[].def.restTime | integer | [integer] |
| dailyWorkouts[].exercises[].def.recordType | string | [string], "general", "strength", "endurance", "timedFasterBetter", "timedLongerBetter", "timedStrength", "cardio", "rest" |
| dailyWorkouts[].exercises[].def.type | string | [string], "system","custom" |
| dailyWorkouts[].exercises[].def.videoType | string | [string], "vimeo", "youtube" |
| dailyWorkouts[].exercises[].def.videoUrl | string | [string] |
| dailyWorkouts[].exercises[].def.videoStatus | string | [string], "processing", "ready", "failed" |
| dailyWorkouts[].exercises[].def.numPhotos | integer | [integer] |
| dailyWorkouts[].exercises[].def.media | object |  |
| dailyWorkouts[].exercises[].def.media.type | string | [string], "vimeo", "youtube", "awss3", "image" |
| dailyWorkouts[].exercises[].def.media.status | string | [string], "processing", "ready", "failed" |
| dailyWorkouts[].exercises[].def.media.default | object |  |
| dailyWorkouts[].exercises[].def.media.default.videoToken | string | [string], xxxx |
| dailyWorkouts[].exercises[].def.media.default.loopVideoToken | string | [string], xxxx |
| dailyWorkouts[].exercises[].def.media.default.videoUrl | object |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.fhd | string |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.hd | string |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.hls | string |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.hlshd | string |  |
| dailyWorkouts[].exercises[].def.media.default.videoUrl.hlssd | string |  |
| dailyWorkouts[].exercises[].def.media.default.loopVideoUrl | object |  |
| dailyWorkouts[].exercises[].def.media.default.loopVideoUrl.fhd | string |  |
| dailyWorkouts[].exercises[].def.media.default.loopVideoUrl.hd | string |  |
| dailyWorkouts[].exercises[].def.media.default.loopVideoUrl.hls | string |  |
| dailyWorkouts[].exercises[].def.media.default.loopVideoUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.media.default.thumbnailUrl | object |  |
| dailyWorkouts[].exercises[].def.media.default.thumbnailUrl.hd | string | [string], If media type is "image", use thumbnailUrl for the images |
| dailyWorkouts[].exercises[].def.media.default.thumbnailUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.media.female | object |  |
| dailyWorkouts[].exercises[].def.media.female.videoToken | string | [string], xxxx |
| dailyWorkouts[].exercises[].def.media.female.loopVideoToken | string | [string], xxxx |
| dailyWorkouts[].exercises[].def.media.female.videoUrl | object |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.fhd | string |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.hd | string |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.hls | string |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.hlshd | string |  |
| dailyWorkouts[].exercises[].def.media.female.videoUrl.hlssd | string |  |
| dailyWorkouts[].exercises[].def.media.female.loopVideoUrl | object |  |
| dailyWorkouts[].exercises[].def.media.female.loopVideoUrl.fhd | string |  |
| dailyWorkouts[].exercises[].def.media.female.loopVideoUrl.hd | string |  |
| dailyWorkouts[].exercises[].def.media.female.loopVideoUrl.hls | string |  |
| dailyWorkouts[].exercises[].def.media.female.loopVideoUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.media.female.thumbnailUrl | object |  |
| dailyWorkouts[].exercises[].def.media.female.thumbnailUrl.hd | string | [string], If media type is "image", use thumbnailUrl for the images |
| dailyWorkouts[].exercises[].def.media.female.thumbnailUrl.sd | string |  |
| dailyWorkouts[].exercises[].def.stats | array[object] |  |
| dailyWorkouts[].exercises[].def.stats[].setID | integer | [integer] |
| dailyWorkouts[].exercises[].def.stats[].reps | integer | [integer], optional |
| dailyWorkouts[].exercises[].def.stats[].weight | number | [decimal], optional |
| dailyWorkouts[].exercises[].def.stats[].distance | number | [decimal], optional |
| dailyWorkouts[].exercises[].def.stats[].time | number | [decimal], optional |
| dailyWorkouts[].exercises[].def.stats[].calories | number | [decimal], optional |
| dailyWorkouts[].exercises[].def.stats[].level | number | [decimal], optional |
| dailyWorkouts[].exercises[].def.stats[].speed | number | [decimal], optional |
| dailyWorkouts[].dateUpdated | string | [string], [YYYY-MM-DD] [HH:MM:SS]; Format: date; Example: 2015-07-22 01:01:55 |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not exist |
| 406 | Parameter missing |
| 500 | General server error |

---

#### POST /dailyWorkout/set

**URL:** `https://api.trainerize.com/v03/dailyWorkout/set`

Schedule a workout

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/dailyWorkout/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "unitWeight": "",
  "unitDistance": "",
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| unitWeight | string | No |  | kg or lbs |
| unitDistance | string | No |  | km or miles |
| userID | integer | Yes |  |  |
| dailyWorkouts | array[object] | Yes |  |  |
| dailyWorkouts[].id | integer | Yes |  | 0 if creating a new workout, >0 if editing an existing one |
| dailyWorkouts[].name | string | Yes |  |  |
| dailyWorkouts[].date | string | Yes |  | date: YYYY-MM-DD |
| dailyWorkouts[].startTime | string | No |  | datetime: YYYY-MM-DD HH:MI:SS |
| dailyWorkouts[].endTime | string | No |  | datetime: YYYY-MM-DD HH:MI:SS |
| dailyWorkouts[].workoutDuration | integer | No |  | Workout real worked duration in seconds |
| dailyWorkouts[].type | string | Yes |  | cardio, workoutRegular, workoutCircuit, workoutTimed, workoutInterval |
| dailyWorkouts[].status | string | Yes |  | scheduled, checkedIn, tracked |
| dailyWorkouts[].style | string | Yes |  | normal, freeStyle |
| dailyWorkouts[].instructions | string | No |  | Instructions for this workout |
| dailyWorkouts[].hasOverride | boolean | No |  |  |
| dailyWorkouts[].comments | object | No |  | Workout comment. Only send comment and RPE, for the first time a user completes the workout |
| dailyWorkouts[].comments.comment | string | No |  |  |
| dailyWorkouts[].comments.rpe | integer | No |  | RPE |
| dailyWorkouts[].intervalProgress | integer | No |  | Workout progress in seconds, status of the workout has to be tracked |
| dailyWorkouts[].trackingStats | object | No |  |  |
| dailyWorkouts[].trackingStats.stats | object | No |  |  |
| dailyWorkouts[].trackingStats.stats.maxHeartRate | integer | No |  |  |
| dailyWorkouts[].trackingStats.stats.avgHeartRate | integer | No |  |  |
| dailyWorkouts[].trackingStats.stats.calories | number | No |  |  |
| dailyWorkouts[].trackingStats.stats.activeCalories | number | No |  |  |
| dailyWorkouts[].exercises | array[object] | Yes |  |  |
| dailyWorkouts[].exercises[].dailyExerciseID | integer | Yes |  | 0 for a new daily exercise, >0 for existing |
| dailyWorkouts[].exercises[].def | object | Yes |  |  |
| dailyWorkouts[].exercises[].def.id | integer | Yes |  |  |
| dailyWorkouts[].exercises[].def.name | string | No |  |  |
| dailyWorkouts[].exercises[].def.description | string | No |  |  |
| dailyWorkouts[].exercises[].def.sets | integer | No |  |  |
| dailyWorkouts[].exercises[].def.target | string | No |  |  |
| dailyWorkouts[].exercises[].def.targetDetail | string | No |  |  |
| dailyWorkouts[].exercises[].def.side | string | No |  | left, right |
| dailyWorkouts[].exercises[].def.superSetID | integer | No |  |  |
| dailyWorkouts[].exercises[].def.supersetType | string | No |  | superset, circuit, none |
| dailyWorkouts[].exercises[].def.intervalTime | integer | No |  | Time allocated for this item, in seconds |
| dailyWorkouts[].exercises[].def.restTime | integer | No |  |  |
| dailyWorkouts[].exercises[].def.recordType | string | No |  | general, strength, endurance, timedFasterBetter, timedLongerBetter, timeedStrength, cardio, rest |
| dailyWorkouts[].exercises[].def.type | string | No |  | system, custom |
| dailyWorkouts[].exercises[].def.vimeoVideo | string | No |  | if type is system |
| dailyWorkouts[].exercises[].def.youTubeVideo | string | No |  | if type is custom |
| dailyWorkouts[].exercises[].def.numPhotos | integer | No |  |  |
| dailyWorkouts[].exercises[].stats | array[object] | No |  |  |
| dailyWorkouts[].exercises[].stats[].setID | integer | No |  |  |
| dailyWorkouts[].exercises[].stats[].reps | integer | No |  |  |
| dailyWorkouts[].exercises[].stats[].weight | number | No |  |  |
| dailyWorkouts[].exercises[].stats[].distance | number | No |  |  |
| dailyWorkouts[].exercises[].stats[].time | number | No |  |  |
| dailyWorkouts[].exercises[].stats[].calories | number | No |  |  |
| dailyWorkouts[].exercises[].stats[].level | number | No |  |  |
| dailyWorkouts[].exercises[].stats[].speed | number | No |  |  |
| dailyWorkouts[].dateUpdated | string | No |  | datetime: YYYY-MM-DD HH:MI:SS |
| dailyWorkouts[].rounds | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | return code |
| statusMsg | string |  |
| dailyWorkoutIDs | array[integer] |  |
| milestoneWorkout | integer | 0 - not a milestone workout, >0 - milestone workout |
| milestones | array[object] |  |
| milestones[].type | string | "time" or "distance" |
| milestones[].exerciseID | integer |  |
| milestones[].milestoneValue | integer | current milestone value, distance in user's distance unit, time in seconds |
| milestones[].nextMilestoneValue | integer | next milestone value, distance in user's distance unit, time in seconds |
| milestones[].totalValue | integer | distance in user's distance unit, time in seconds |
| brokenRecords | array[object] |  |
| brokenRecords[].dailyExerciseID | integer |  |
| brokenRecords[].exerciseID | integer |  |
| brokenRecords[].name | string |  |
| brokenRecords[].recordType | string | strength, endurance, cardio, timedLongerBetter, timerdStrength, timedFasterBetter, general, rest |
| brokenRecords[].bestStats | object |  |
| brokenRecords[].bestStats.oneRepMax | integer | for strength |
| brokenRecords[].bestStats.oneRepMaxIncrease | integer | for strength |
| brokenRecords[].bestStats.maxWeight | integer | for strength |
| brokenRecords[].bestStats.maxWeightIncrease | integer | for strength |
| brokenRecords[].bestStats.maxLoad | integer | for strength, timedStrength |
| brokenRecords[].bestStats.maxLoadIncrease | integer | for strength, timedStrength |
| brokenRecords[].bestStats.maxReps | integer | for endurance |
| brokenRecords[].bestStats.maxRepsIncrease | integer | for endurance |
| brokenRecords[].bestStats.maxSpeed | integer | for cardio |
| brokenRecords[].bestStats.maxSpeedIncrease | integer | for cardio |
| brokenRecords[].bestStats.maxDistance | integer | for cardio |
| brokenRecords[].bestStats.maxDistanceIncrease | integer | for cardio |
| brokenRecords[].bestStats.maxTime | integer | for timedLongerBetter |
| brokenRecords[].bestStats.maxTimeIncrease | integer | for timedLongerBetter |
| brokenRecords[].bestStats.minTime | integer | for timedFasterBetter |
| brokenRecords[].bestStats.minTimeDecrease | integer | for timedFasterBetter |
| brokenRecords[].bestStats.maxLoadWeight | integer | for timedStrength |
| brokenRecords[].bestStats.maxLoadTime | integer | for timedStrength |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

### exercise

#### POST /exercise/get

**URL:** `https://api.trainerize.com/v03/exercise/get`

Get exercise detail

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/exercise/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | Exercise ID |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer |  |
| name | string |  |
| alternateName | string |  |
| description | string |  |
| recordType | string | exercise recordType: general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio |
| tag | string | arms, shoulder, chest, back, abs, legs, cardio, fullBody, none |
| videoUrl | string |  |
| videoType | string | youtube, vimeo |
| videoStatus | string | processing, ready, failing |
| numPhotos | integer | Number of images for this exercise |
| tags | array[object] |  |
| tags[].type | string |  |
| tags[].name | string |  |
| version | string | Version of the exercise YYYY-MM-DD |
| media | object |  |
| media.type | string | vimeo, youtube, awss3, image |
| media.status | string | processing, ready, failed |
| media.default | object |  |
| media.default.videoToken | string |  |
| media.default.loopVideoToken | string |  |
| media.default.videoUrl | object |  |
| media.default.videoUrl.fhd | string |  |
| media.default.videoUrl.hd | string |  |
| media.default.videoUrl.hls | string |  |
| media.default.videoUrl.sd | string |  |
| media.default.loopVideoUrl | object |  |
| media.default.loopVideoUrl.fhd | string |  |
| media.default.loopVideoUrl.hd | string |  |
| media.default.loopVideoUrl.hls | string |  |
| media.default.loopVideoUrl.sd | string |  |
| media.default.thumbnailUrl | object |  |
| media.default.thumbnailUrl.hd | string |  |
| media.default.thumbnailUrl.sd | string |  |
| media.female | object |  |
| media.female.videoToken | string |  |
| media.female.loopVideoToken | string |  |
| media.female.videoUrl | object |  |
| media.female.videoUrl.fhd | string |  |
| media.female.videoUrl.hd | string |  |
| media.female.videoUrl.hls | string |  |
| media.female.videoUrl.sd | string |  |
| media.female.loopVideoUrl | object |  |
| media.female.loopVideoUrl.fhd | string |  |
| media.female.loopVideoUrl.hd | string |  |
| media.female.loopVideoUrl.hls | string |  |
| media.female.loopVideoUrl.sd | string |  |
| media.female.thumbnailUrl | object |  |
| media.female.thumbnailUrl.hd | string |  |
| media.female.thumbnailUrl.sd | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request. |
| 500 | Server error |

---

#### POST /exercise/set

**URL:** `https://api.trainerize.com/v03/exercise/set`

Update a custom exercise

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/exercise/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "name": "",
  "alternateName": "",
  "description": "",
  "recordType": "",
  "tag": "",
  "videoUrl": "",
  "videoType": "",
  "videoStatus": "",
  "videoTrainerType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | Exercise ID |
| name | string | No |  |  |
| alternateName | string | No |  |  |
| description | string | No |  |  |
| recordType | string | No |  | exercise recordType: general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio |
| tag | string | No |  | arms, shoulder, chest, back, abs, legs, cardio, fullBody, none |
| videoUrl | string | No |  |  |
| videoType | string | No |  | youtube, vimeo |
| videoStatus | string | No |  | processing, ready, failing |
| videoTrainerType | string | No |  |  |
| tags | array[object] | No |  |  |
| tags[].type | string | No |  |  |
| tags[].name | string | No |  |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request. |
| 500 | Server error |

---

#### POST /exercise/add

**URL:** `https://api.trainerize.com/v03/exercise/add`

Add a custom exercise

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/exercise/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "name": "",
  "alternateName": "",
  "description": "",
  "recordType": "",
  "tag": "",
  "videoUrl": "",
  "videoType": "",
  "videoStatus": "",
  "videoTrainerType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | No |  |  |
| alternateName | string | No |  |  |
| description | string | No |  |  |
| recordType | string | No |  | exercise recordType: general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio |
| tag | string | No |  | arms, shoulder, chest, back, abs, legs, cardio, fullBody, none |
| videoUrl | string | No |  |  |
| videoType | string | No |  | youtube, vimeo |
| videoStatus | string | No |  | processing, ready, failing |
| videoTrainerType | string | No |  |  |
| tags | array[object] | No |  |  |
| tags[].type | string | No |  |  |
| tags[].name | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Exercise ID |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request. |
| 500 | Server error |

---

### file

#### POST /file/upload

**URL:** `https://api.trainerize.com/v03/file/upload`

Upload files: request must be multipart/form-data, containing "file" field with the file binary, and "data" field with the JSON object with additional parameters

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/file/upload \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | string |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

### goal

#### POST /goal/add

**URL:** `https://api.trainerize.com/v03/goal/add`

Add an Goal. Can be a weight goal or nutrition goal or text goal

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | goal id |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /goal/delete

**URL:** `https://api.trainerize.com/v03/goal/delete`

delete an goal

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | goal ID |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /goal/getList

**URL:** `https://api.trainerize.com/v03/goal/getList`

Get the user's goal by ID

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "unitWeight": "",
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  | client ID |
| unitWeight | string | No |  | kg, lbs |
| achieved | boolean | No |  |  |
| start | integer | No |  |  |
| count | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer |  |
| goals | array[object] |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /goal/get

**URL:** `https://api.trainerize.com/v03/goal/get`

get an goal

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "unitWeight": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | client ID |
| achieved | boolean | No |  |  |
| unitWeight | string | No |  | kg, lbs |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /goal/set

**URL:** `https://api.trainerize.com/v03/goal/set`

Add an Goal. Can be a weight goal or nutrition goal or text goal

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /goal/setProgress

**URL:** `https://api.trainerize.com/v03/goal/setProgress`

Update an goal's progress

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/goal/setProgress \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | goal ID |
| progress | number | No |  | progress in percentage |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /trainerNote/delete

**URL:** `https://api.trainerize.com/v03/trainerNote/delete`

Delete the note

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainerNote/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | Trainer Note ID |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user trainer notes. |
| 404 | User not found / Note not found. |
| 500 | General server error |

---

### habits

#### POST /habits/add

**URL:** `https://api.trainerize.com/v03/habits/add`

Add an Habits

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/habits/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "type": "customHabit",
  "name": "New Habits",
  "customTypeID": 0,
  "startDate": "2019-01-01",
  "durationType": "week",
  "duration": 5
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| type | string | No | customHabit | "customHabit", "eatProtein", "eatGoodFat", "eatComplexCarb", "eatVeggie", "followPortionGuide", "practiceEatingSlowly", "eatUntilAlmostFull"
, "prepareYourOwnMeal", "drinkOnlyZeroCalorieDrink","abstainFromAlcohol", "takeAMoreActiveRoute", "makeItEasierToWorkout", "doAnEnjoyableActivity"
, "recruitSocialSupport", "rewardYourselfAfterAWorkout", "prioritizeSelfCare", "celebrateAWin", "digitalDetoxOneHourBeforeBed", "practiceBedtimeRitual" |
| name | string | No | New Habits |  |
| customTypeID | integer | No |  | Custom Habit Type as defined in a custom folder in Habits Master Library |
| startDate | string | No | 2019-01-01 | [YYYY-MM-DD]; Format: date |
| durationType | string | No | week |  |
| duration | integer | No | 5 |  |
| repeatDetail | object | No |  |  |
| repeatDetail.dayOfWeeks | array | No | ['monday', 'sunday'] | monday, tuesday, wednesday, thursday, friday, saturday, sunday |
| habitsDetail | object | No |  |  |
| habitsDetail.nutritionPortion | object | No |  |  |
| habitsDetail.nutritionPortion.numberOfMeals | integer | No | 0 | 0 - each meal, 1 - 1 meal ... |
| habitsDetail.nutritionPortion.showHandPortionGuide | boolean | No | true |  |
| habitsDetail.nutritionPortion.carbs | integer | No | 1 |  |
| habitsDetail.nutritionPortion.protein | integer | No | 2 |  |
| habitsDetail.nutritionPortion.fat | integer | No | 3 |  |
| habitsDetail.nutritionPortion.veggies | integer | No | 4 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Habits ID; Example: 10 |

---

#### POST /habits/deleteDailyItem

**URL:** `https://api.trainerize.com/v03/habits/deleteDailyItem`

Delete daily habits

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/habits/deleteDailyItem \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "dailyItemID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| dailyItemID | integer | No | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| message | string | "Habits deleted". |

---

#### POST /habits/getList

**URL:** `https://api.trainerize.com/v03/habits/getList`

Get an list of Habits for a user.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/habits/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "status": "current",
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| status | string | No | current | "current", "upcoming", "past" |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer | Example: 10 |
| habits | array[object] |  |
| habits[].id | integer | Example: 123 |
| habits[].type | string | "customHabit", "eatProtein", "eatGoodFat", "eatComplexCarb", "eatVeggie", "followPortionGuide", "practiceEatingSlowly", "eatUntilAlmostFull"
, "prepareYourOwnMeal", "drinkOnlyZeroCalorieDrink","abstainFromAlcohol", "takeAMoreActiveRoute", "makeItEasierToWorkout", "doAnEnjoyableActivity"
, "recruitSocialSupport", "rewardYourselfAfterAWorkout", "prioritizeSelfCare", "celebrateAWin", "digitalDetoxOneHourBeforeBed", "practiceBedtimeRitual"; Example: customHabit |
| habits[].name | string | Example: New Habits |
| habits[].customTypeID | integer | Example: 123 |
| habits[].startDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-01-01 |
| habits[].endDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-02-01 |
| habits[].durationType | string | Example: week |
| habits[].duration | integer | Example: 5 |
| habits[].currentStreak | integer | Example: 2 |
| habits[].longestStreak | integer | Example: 5 |
| habits[].totalItems | integer | Example: 18 |
| habits[].totalCompleted | integer | Example: 9 |
| habits[].totalCompletedAllTime | integer | Example: 55 |
| habits[].streakBroken | boolean | Example: False |
| habits[].longestStreakStartDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-01-01 |
| habits[].longestStreakEndDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-02-01 |
| habits[].repeatDetail | object |  |
| habits[].repeatDetail.dayOfWeeks | array | monday, tuesday, wednesday, thursday, friday, saturday, sunday; Example: ['monday', 'sunday'] |
| habits[].habitsDetail | object |  |
| habits[].habitsDetail.nutritionPortion | object |  |
| habits[].habitsDetail.nutritionPortion.numberOfMeals | integer | 0 - each meal, 1 - 1 meal ...; Example: 0 |
| habits[].habitsDetail.nutritionPortion.showHandPortionGuide | boolean | Example: true |
| habits[].habitsDetail.nutritionPortion.carbs | integer | Example: 1 |
| habits[].habitsDetail.nutritionPortion.protein | integer | Example: 2 |
| habits[].habitsDetail.nutritionPortion.fat | integer | Example: 3 |
| habits[].habitsDetail.nutritionPortion.veggies | integer | Example: 4 |

---

#### POST /habits/getDailyItem

**URL:** `https://api.trainerize.com/v03/habits/getDailyItem`

Get Habit daily item

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/habits/getDailyItem \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "dailyItemID": "123"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| dailyItemID | integer | No | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Habits daily Item id; Example: 123 |
| userID | integer | Example: 123 |
| type | string | "customHabit", "eatProtein", "eatGoodFat", "eatComplexCarb", "eatVeggie", "followPortionGuide", "practiceEatingSlowly", "eatUntilAlmostFull"
, "prepareYourOwnMeal", "drinkOnlyZeroCalorieDrink","abstainFromAlcohol", "takeAMoreActiveRoute", "makeItEasierToWorkout", "doAnEnjoyableActivity"
, "recruitSocialSupport", "rewardYourselfAfterAWorkout", "prioritizeSelfCare", "celebrateAWin", "digitalDetoxOneHourBeforeBed", "practiceBedtimeRitual"; Example: customHabit |
| name | string | Example: Drink more water |
| description | string | Example: xxxx |
| date | string | [YYYY-MM-DD]; Format: date; Example: 2019-01-01 |
| status | string | "scheduled", "tracked" |
| habit | array[object] |  |
| habit[].id | integer | Example: 123 |
| habit[].type | string | "customHabit", "eatProtein", "eatGoodFat", "eatComplexCarb", "eatVeggie", "followPortionGuide", "practiceEatingSlowly", "eatUntilAlmostFull"
, "prepareYourOwnMeal", "drinkOnlyZeroCalorieDrink","abstainFromAlcohol", "takeAMoreActiveRoute", "makeItEasierToWorkout", "doAnEnjoyableActivity"
, "recruitSocialSupport", "rewardYourselfAfterAWorkout", "prioritizeSelfCare", "celebrateAWin", "digitalDetoxOneHourBeforeBed", "practiceBedtimeRitual"; Example: customHabit |
| habit[].name | string | Example: New Habits |
| habit[].customTypeID | integer | Example: 123 |
| habit[].fromHQ | boolean |  |
| habit[].startDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-01-01 |
| habit[].endDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-02-01 |
| habit[].durationType | string | Example: week |
| habit[].duration | integer | Example: 5 |
| habit[].currentStreak | integer | Example: 2 |
| habit[].longestStreak | integer | Example: 5 |
| habit[].longestStreakStartDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-01-01 |
| habit[].longestStreakEndDate | string | [YYYY-MM-DD]; Format: date; Example: 2019-02-01 |
| habit[].totalItems | integer | Example: 18 |
| habit[].totalCompleted | integer | Example: 9 |
| habit[].totalCompletedAllTime | integer | Example: 25 |
| habit[].streakBroken | boolean | Example: False |
| habit[].repeatDetail | object |  |
| habit[].repeatDetail.dayOfWeeks | array | monday, tuesday, wednesday, thursday, friday, saturday, sunday; Example: ['monday', 'sunday'] |
| habit[].habitsDetail | object |  |
| habit[].habitsDetail.nutritionPortion | object |  |
| habit[].habitsDetail.nutritionPortion.numberOfMeals | integer | 0 - each meal, 1 - 1 meal ...; Example: 0 |
| habit[].habitsDetail.nutritionPortion.showHandPortionGuide | boolean | Example: true |
| habit[].habitsDetail.nutritionPortion.carbs | integer | Example: 1 |
| habit[].habitsDetail.nutritionPortion.protein | integer | Example: 2 |
| habit[].habitsDetail.nutritionPortion.fat | integer | Example: 3 |
| habit[].habitsDetail.nutritionPortion.veggies | integer | Example: 4 |

---

#### POST /habits/setDailyItem

**URL:** `https://api.trainerize.com/v03/habits/setDailyItem`

Track habits

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/habits/setDailyItem \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "dailyItemID": 123,
  "status": "tracked"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| dailyItemID | integer | No | 123 |  |
| status | string | No | tracked |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| currentStreak | integer | Example: 6 |
| longestStreak | integer | Example: 18 |
| milestoneHabit | integer | Example: 0 |
| nextMilestone | integer | Example: 5 |
| streakBroken | boolean | Example: False |
| previousLongestStreak | integer | Example: 18 |

---

### healthData

#### POST /healthData/getList

**URL:** `https://api.trainerize.com/v03/healthData/getList`

Get an list of HealthData for a user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/healthData/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "type": "step",
  "startDate": "2019-01-01",
  "endDate": "2019-2-01"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| type | string | No | step | step, restingHeartRate, sleep, bloodPressure, calorieOut |
| startDate | string | No | 2019-01-01 | [YYYY-MM-DD]; Format: date |
| endDate | string | No | 2019-2-01 | [YYYY-MM-DD]; Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| isTracked | boolean |  |
| healthData | array[object] |  |
| healthData[].healthDataID | integer |  |
| healthData[].type | string | step, restingHeartRate, sleep, bloodPressure, calorieOut |
| healthData[].date | string | Format: date |
| healthData[].data | object |  |
| healthData[].data.systolic | integer |  |
| healthData[].data.diastolic | integer |  |
| healthData[].data.restingHeartRate | integer |  |
| healthData[].data.restingEnergy | integer |  |
| healthData[].data.activeEnergy | integer |  |
| healthData[].data.steps | integer |  |

---

#### POST /healthData/getListSleep

**URL:** `https://api.trainerize.com/v03/healthData/getListSleep`

Get an list of HealthData for a user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/healthData/getListSleep \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "startTime": "2019-11-01 12:12:12",
  "endDate": "2019-12-01 12:12:12"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| startTime | string | No | 2019-11-01 12:12:12 | [YYYY-MM-DD] [HH:MM:SS]; Format: date |
| endDate | string | No | 2019-12-01 12:12:12 | [YYYY-MM-DD] [HH:MM:SS]; Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| isTracked | boolean |  |
| healthData | array[object] |  |
| healthData[].startTime | string | Format: date; Example: 2019-11-01 12:12:12 |
| healthData[].endTime | string | Format: date; Example: 2019-11-01 12:12:12 |
| healthData[].type | string | Example: alseep |

---

### location

#### POST /location/getList

**URL:** `https://api.trainerize.com/v03/location/getList`

Move a program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/location/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "groupID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| groupID | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| locations | array[object] |  |
| locations[].id | integer | location ID |
| locations[].name | string |  |
| locations[].type | string | online, physical |
| locations[].address1 | string |  |
| locations[].address2 | string |  |
| locations[].city | string |  |
| locations[].state | string |  |
| locations[].country | string |  |
| locations[].zipCode | string |  |
| locations[].phoneNumber | string |  |
| locations[].lat | number |  |
| locations[].lng | number |  |
| locations[].isActive | boolean |  |
| locations[].hours | array[object] |  |
| locations[].hours[].weekDay | string | one of "monday, tuesday, wednesday, thursday, friday, saturday, sunday" |
| locations[].hours[].isClose | boolean |  |
| locations[].hours[].openAt | integer | 600 - 10:00 |
| locations[].hours[].closeAt | integer | 1080 - 18:00 |

---

### message

#### POST /message/get

**URL:** `https://api.trainerize.com/v03/message/get`

Gets one message detail

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/message/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "messageID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| messageID | integer | Yes | 123 | message ID |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| messageID | integer |  |
| type | string | "text","file","appear" |
| source | string | "user","activity" |
| sender | object |  |
| sender.id | integer | UserID; Example: 123 |
| sender.firstName | string | Example: abc |
| sender.lastName | string | Example: def |
| sender.profileIconUrl | string | Example: xxx |
| sender.type | string | "client","trainer"; Example: client |
| sentTime | string | [YYYY-MM-DD] [HH:MM:SS] (timezone GMT); Format: date; Example: 2019-11-01 12:12:12 |
| body | string | string HTML encoded |
| attachment | object |  |
| attachment.id | integer | Example: 123 |
| attachment.userID | integer | UserID; Example: 123 |
| attachment.fileName | string | xxx |
| attachment.storageType | string | xxx |
| attachment.fileToken | string | xxx |
| attachment.contentType | string | xxx |
| attachment.attachType | string | xxx |
| attachment.attachTo | string | xxx |
| attachment.fileSize | integer | Example: 12345 |
| attachment.created | string | xxx |
| linkInfo | object |  |
| linkInfo.url | string | http://www.trainerize.com |
| linkInfo.redirected | boolean | Example: True |
| linkInfo.canonicalUrl | string | http://www.trainerize.com |
| linkInfo.type | string | "website", image, video, link, or facebook tag type |
| linkInfo.site | string | http://www.trainerize.com |
| linkInfo.title | string | Trainerize \| Trainerize Personal Trainer Software |
| linkInfo.description | string | Trainerize is a powerful personal training software designed to help you reach more clients with online training, meal planning, messaging, and workout tracking. |
| linkInfo.imageUrl | string | http://www.trainerize.com/images/trainerize-app-social-share.jpg |
| linkInfo.imageWidth | integer | this could be null; Example: 123 |
| linkInfo.imageHeight | integer | Example: 123 |
| linkInfo.videoUrl | string | xxx |
| linkInfo.videoType | string | xxx |
| linkInfo.videoWidth | string | Example: xxx |
| linkInfo.videoHeight | string | Example: xxx |
| linkInfo.fileSize | integer | Example: 12345 |
| productInfo | object | Product Info will be refreshed in this call |
| productInfo.planID | integer | Example: 123 |
| productInfo.couponID | string | Example: ABC |
| productInfo.detail | object |  |
| productInfo.detail.planDetail | object |  |
| productInfo.detail.planDetail.planID | integer | Example: 123 |
| productInfo.detail.planDetail.planType | string | "plan", "package" |
| productInfo.detail.planDetail.name | string | xxxx |
| productInfo.detail.planDetail.description | string | xxxx |
| productInfo.detail.planDetail.imageID | integer | file ID; Example: 12 |
| productInfo.detail.planDetail.isActive | boolean | Example: True |
| productInfo.detail.planDetail.isListed | boolean | Example: True |
| productInfo.detail.planDetail.amount | integer | in cents; Example: 100 |
| productInfo.detail.planDetail.currency | string | Example: usd |
| productInfo.detail.planDetail.interval | integer | null for package; Example: 10 |
| productInfo.detail.planDetail.intervalType | string | Example: "day", "week", "month", "year", null for package |
| productInfo.detail.planDetail.duration | integer | Example: 10 |
| productInfo.detail.planDetail.paymentLink | string | Example: xxx |
| productInfo.detail.couponDetail | object |  |
| productInfo.detail.couponDetail.couponID | string | Example: ABC |
| productInfo.detail.couponDetail.amountOff | integer | amount in cents; Example: 12 |
| productInfo.detail.couponDetail.currency | string | currency currently ignored; Example: usd |
| productInfo.detail.couponDetail.duration | string | "forever", "once", or "repeating" |
| productInfo.detail.couponDetail.repeatFor | integer | provided if duration is "repeating" |
| productInfo.detail.couponDetail.repeatType | string | "day", "week", "month", "year", provided if duration is "repeating" |
| productInfo.detail.couponDetail.maxRedemptions | integer | Example: 10 |
| productInfo.detail.couponDetail.percentOff | integer | Example: 10 |
| workoutInfo | object |  |
| workoutInfo.workoutID | integer | Example: 123 |
| workoutInfo.dailyWorkoutID | integer | if workout is completed by the current user the dailyWorkoutID will have the value.; Example: 123 |
| workoutInfo.started | object | First user + total count for doing it right now |
| workoutInfo.started.total | integer | Example: 100 |
| workoutInfo.started.users | object |  |
| workoutInfo.started.users.id | integer | UserID; Example: 123 |
| workoutInfo.started.users.firstName | string | Example: abc |
| workoutInfo.started.users.lastName | string | Example: def |
| workoutInfo.started.users.profileIconUrl | string | Example: xxx |
| workoutInfo.started.users.type | string | "client","trainer"; Example: client |
| workoutInfo.finished | object | First user + total count for done it |
| workoutInfo.finished.total | integer | Example: 100 |
| workoutInfo.finished.users | object |  |
| workoutInfo.finished.users.id | integer | UserID; Example: 123 |
| workoutInfo.finished.users.firstName | string | Example: abc |
| workoutInfo.finished.users.lastName | string | Example: def |
| workoutInfo.finished.users.profileIconUrl | string | Example: xxx |
| workoutInfo.finished.users.type | string | "client","trainer"; Example: client |
| reactions | object |  |
| reactions.id | integer | ReactionID; Example: 123 |
| reactions.reaction | string | Example: thumb-up |
| reactions.users | object |  |
| reactions.users.id | integer | UserID; Example: 123 |
| reactions.users.firstName | string | Example: abc |
| reactions.users.lastName | string | Example: def |
| reactions.users.profileIconUrl | string | Example: xxx |
| reactions.users.type | string | "client","trainer"; Example: client |
| reactions.date | string | [YYYY-MM-DD] [HH:MM:SS]; Format: date; Example: 2019-11-01 12:12:12 |
| appearRoom | string | "abc" -- AppearRoom name |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | User does not have privilege to access thread data |
| 404 | Thread not found |
| 500 | General server error |

---

#### POST /message/getThreads

**URL:** `https://api.trainerize.com/v03/message/getThreads`

Gets a list of the threads for a user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/message/getThreads \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673594,
  "view": "inbox",
  "clientID": 673695,
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 673594 | user id |
| view | string | No | inbox | inbox, byClient, archived |
| clientID | integer | No | 673695 | filter by client id |
| start | integer | No |  |  |
| count | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer |  |
| threads | array[object] |  |
| threads[].threadID | integer |  |
| threads[].ccUsers | array[object] |  |
| threads[].ccUsers[].userID | integer |  |
| threads[].lastSentTime | string | YYYY-MM-DD HH:MM (timezone GMT) |
| threads[].subject | string | HTML encoded |
| threads[].excerpt | string |  |
| threads[].threadType | string | mainThread, otherThread |
| threads[].totalUnreadMessages | integer |  |
| threads[].status | string | read, unread |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | BadRequest. pageIndex or pageSize lower than 0 |
| 404 | User not found |
| 500 | General server error |

---

#### POST /message/reply

**URL:** `https://api.trainerize.com/v03/message/reply`

adds a reply to thread

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/message/reply \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673594,
  "threadID": 0,
  "body": "Message body",
  "type": "text",
  "appearRoom": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 673594 | Message Sender ID (Only group level Auth can send message on behavior of other users) |
| threadID | integer | No |  |  |
| body | string | No | Message body | Thread body |
| type | string | No | text | text, appear |
| appearRoom | string | No |  | AppearRoom name |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| messageID | integer |  |
| linkInfo | object |  |
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | Thread not found |
| 500 | General server error |

---

#### POST /message/sendMass

**URL:** `https://api.trainerize.com/v03/message/sendMass`

adds a reply to thread

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/message/sendMass \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673594,
  "recipients": [
    673695,
    673701
  ],
  "subject": "Mass message test",
  "body": "this is a test of the sending mass",
  "threadType": "otherThread",
  "conversationType": "group",
  "type": "text",
  "appearRoom": "abc"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 1234 | Message Sender ID (Only group level Auth can send message on behavior of other users) |
| recipients | array[integer] | No | [673695, 673701] |  |
| body | string | No | Send mass message test | Thread body |
| type | string | No | text | "text", "appear |
| threadType | string | No | mainThread | "mainThread", "otherThread" |
| conversationType | string | No | group | "group", "single" |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| linkInfo | object |  |

---

#### POST /message/send

**URL:** `https://api.trainerize.com/v03/message/send`

starts a new message thread. we will keep this open. Any message be between anyone in the group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/message/send \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673594,
  "subject": "Mass message test",
  "body": "Message body",
  "threadType": "mainThread",
  "conversationType": "single",
  "type": "text",
  "appearRoom": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 673594 | Message Sender ID (Only group level Auth can send message on behavior of other users) |
| recipients | array[integer] | No |  |  |
| subject | string | No | Mass message test | Thread subject |
| body | string | No | Message body | Thread body |
| threadType | string | No | mainThread | mainThread, otherThread |
| conversationType | string | No | single | group, single |
| type | string | No | text | text, appear |
| appearRoom | string | No |  | AppearRoom name |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| threadID | integer |  |
| threads | array[object] |  |
| threads[].threadID | integer |  |
| threads[].messageID | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not found |
| 406 | User does not exist in group, cannot message |
| 500 | General server error |

---

### mealPlan

#### POST /mealPlan/delete

**URL:** `https://api.trainerize.com/v03/mealPlan/delete`

delete meal plan.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/mealPlan/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 1234
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 1234 | [long - user id]; Format: int64 |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| statusMsg | string | Example: OK |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not exist |
| 406 | Parameter missing |
| 500 | General server error |

---

#### POST /mealPlan/generate

**URL:** `https://api.trainerize.com/v03/mealPlan/generate`

Generate a new meal plan

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/mealPlan/generate \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userId": 0,
  "caloriesTarget": 0,
  "macroSplit": "",
  "mealsPerDay": 0,
  "sampleDays": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userId | integer | Yes |  |  |
| caloriesTarget | integer | Yes |  | Must be 1400-3000 for 3 meals per day, 1600-3800 - 4 meals per day, 1800-3800 - 5 meals per day, 2000-4000 - 6 meals per day |
| macroSplit | string | Yes |  | possible options - "balanced", "lowCarb", "lowFat", "highProtein" |
| mealsPerDay | integer | Yes |  | Must be in the range [3, 6] |
| sampleDays | integer | Yes |  | Must be in the range [1, 3] |
| excludes | array[string] | Yes |  | possible options - "fish", "shellfish", "soy", "treeNuts", "eggs", "dairy", "gluten", "peanuts", "meat" |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Example: 3333 |
| mealPlanName | string | string; Example: xxxx |
| mealPlanType | string | file - pdf attachment, en - Evolution nutrition, planner - Trainerize meal plan; Example: file |
| caloriesTarget | integer | --For Trainerize Meal Plan; Example: 5000 |
| macroSplit | string | Example: balanced |
| mealsPerDay | integer | Example: 5 |
| dietaryPreference | string | Example: noPreferences |
| sampleDays | integer | Example: 5 |
| excludes | array[any] | possible options - "fish", "shellfish", "soy", "treeNuts", "eggs", "dairy", "gluten", "peanuts" |
| mealPlanDays | array[object] |  |
| mealPlanDays[].day | integer | Example: 1 |
| mealPlanDays[].caloriesSummary | integer | Example: 5520 |
| mealPlanDays[].breakfast | object |  |
| mealPlanDays[].breakfast.mealTemplateId | integer | Example: 28 |
| mealPlanDays[].breakfast.templateType | string | Example: system |
| mealPlanDays[].breakfast.multiplier | integer | Example: 1 |
| mealPlanDays[].breakfast.userId | integer |  |
| mealPlanDays[].breakfast.groupId | integer |  |
| mealPlanDays[].breakfast.mealName | string | Example: Meal planner 1 |
| mealPlanDays[].breakfast.mealTypes | array[string] |  |
| mealPlanDays[].breakfast.description | string |  |
| mealPlanDays[].breakfast.caloriesSummary | integer | Example: 1104 |
| mealPlanDays[].breakfast.dietaryPreference | string | Example: paleo |
| mealPlanDays[].breakfast.prepareTime | integer | Example: 10 |
| mealPlanDays[].breakfast.cookTime | integer | Example: 10 |
| mealPlanDays[].breakfast.recipeServingAmount | integer | Example: 1 |
| mealPlanDays[].breakfast.fileId | integer | Example: 123 |
| mealPlanDays[].breakfast.carbsSummary | integer | Example: 0 |
| mealPlanDays[].breakfast.proteinSummary | number | Example: 0.7399 |
| mealPlanDays[].breakfast.fatSummary | number | Example: 0.7399 |
| mealPlanDays[].breakfast.nutrients | array[object] |  |
| mealPlanDays[].breakfast.nutrients[].nutrNo | integer | Example: 203 |
| mealPlanDays[].breakfast.nutrients[].nutrVal | number | Example: 0.7399 |
| mealPlanDays[].breakfast.media | object |  |
| mealPlanDays[].breakfast.media.id | integer | number - integer |
| mealPlanDays[].breakfast.media.modified | string | For group/system level meal templates only; Format: date-time; Example: 2021-01-01 12:00:00 |
| mealPlanDays[].breakfast.media.type | string | Example: awss3 |
| mealPlanDays[].breakfast.media.mediaType | string | Example: "image", "video" |
| mealPlanDays[].breakfast.media.status | string | Example: "queued", "processing", "ready", "failed" |
| mealPlanDays[].breakfast.media.duration | integer | in seconds; Example: 100 |
| mealPlanDays[].breakfast.media.videoUrl | object |  |
| mealPlanDays[].breakfast.media.videoUrl.hls | string |  |
| mealPlanDays[].breakfast.media.videoUrl.hlssd | string |  |
| mealPlanDays[].breakfast.media.videoUrl.hlshd | string |  |
| mealPlanDays[].breakfast.media.thumbnailUrl | object |  |
| mealPlanDays[].breakfast.media.thumbnailUrl.hd | string |  |
| mealPlanDays[].breakfast.media.thumbnailUrl.sd | string |  |
| mealPlanDays[].breakfast.media.lunch | object |  |
| mealPlanDays[].breakfast.media.dinner | object |  |
| mealPlanDays[].breakfast.media.snack1 | object |  |
| mealPlanDays[].breakfast.media.snack2 | object |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /mealPlan/get

**URL:** `https://api.trainerize.com/v03/mealPlan/get`

Get meal plan information.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/mealPlan/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 123,
  "userid": 1234
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 123 | mealPlanID, retrieve mealPlan by mealPlanID |
| userid | integer | No | 1234 | [long - user id], retrieve mealPlan by clientID |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Example: 3333 |
| mealPlanName | string | string; Example: xxxx |
| mealPlanType | string | file - pdf attachment, en - Evolution nutrition, planner - Trainerize meal plan --For Trainerize Meal Plan; Example: file |
| enMealPlanID | string | For EN Meal Plan |
| attachment | object | For PDF attachment |
| attachment.attachmentID | integer | Example: 1 |
| attachment.fileName | string |  |
| attachment.fileToken | string |  |
| attachment.contentType | string |  |
| attachment.size | string |  |
| attachment.created | string | [Date - time]; Format: date-time; Example: 2015-05-01 01:01:55 |
| caloriesTarget | integer | For Trainerize Meal Plan; Example: 5000 |
| macroSplit | string | Example: balanced |
| mealsPerDay | integer | Example: 5 |
| dietaryPreference | string | Example: noPreferences |
| sampleDays | integer | Example: 5 |
| excludes | array[any] | possible options - "fish", "shellfish", "soy", "treeNuts", "eggs", "dairy", "gluten", "peanuts" |
| mealPlanDays | array[object] |  |
| mealPlanDays[].day | integer | Example: 1 |
| mealPlanDays[].caloriesSummary | integer | Example: 5520 |
| mealPlanDays[].breakfast | object |  |
| mealPlanDays[].breakfast.mealTemplateId | integer | Example: 28 |
| mealPlanDays[].breakfast.templateType | string | Example: system |
| mealPlanDays[].breakfast.multiplier | integer | Example: 1 |
| mealPlanDays[].breakfast.userId | integer |  |
| mealPlanDays[].breakfast.groupId | integer |  |
| mealPlanDays[].breakfast.mealName | string | Example: Meal planner 1 |
| mealPlanDays[].breakfast.mealTypes | array[string] |  |
| mealPlanDays[].breakfast.description | string |  |
| mealPlanDays[].breakfast.caloriesSummary | integer | Example: 1104 |
| mealPlanDays[].breakfast.dietaryPreference | string | Example: paleo |
| mealPlanDays[].breakfast.prepareTime | integer | Example: 10 |
| mealPlanDays[].breakfast.cookTime | integer | Example: 10 |
| mealPlanDays[].breakfast.recipeServingAmount | integer | Example: 1 |
| mealPlanDays[].breakfast.fileId | integer | Example: 123 |
| mealPlanDays[].breakfast.carbsSummary | integer | Example: 0 |
| mealPlanDays[].breakfast.proteinSummary | number | Example: 0.7399 |
| mealPlanDays[].breakfast.fatSummary | number | Example: 0.7399 |
| mealPlanDays[].breakfast.nutrients | array[object] |  |
| mealPlanDays[].breakfast.nutrients[].nutrNo | integer | Example: 203 |
| mealPlanDays[].breakfast.nutrients[].nutrVal | number | Example: 0.7399 |
| mealPlanDays[].breakfast.media | object |  |
| mealPlanDays[].breakfast.media.id | integer | number - integer |
| mealPlanDays[].breakfast.media.modified | string | For group/system level meal templates only; Format: date-time; Example: 2021-01-01 12:00:00 |
| mealPlanDays[].breakfast.media.type | string | Example: awss3 |
| mealPlanDays[].breakfast.media.mediaType | string | Example: "image", "video" |
| mealPlanDays[].breakfast.media.status | string | Example: "queued", "processing", "ready", "failed" |
| mealPlanDays[].breakfast.media.duration | integer | in seconds; Example: 100 |
| mealPlanDays[].breakfast.media.videoUrl | object |  |
| mealPlanDays[].breakfast.media.videoUrl.hls | string |  |
| mealPlanDays[].breakfast.media.videoUrl.hlssd | string |  |
| mealPlanDays[].breakfast.media.videoUrl.hlshd | string |  |
| mealPlanDays[].breakfast.media.thumbnailUrl | object |  |
| mealPlanDays[].breakfast.media.thumbnailUrl.hd | string |  |
| mealPlanDays[].breakfast.media.thumbnailUrl.sd | string |  |
| mealPlanDays[].breakfast.media.lunch | object |  |
| mealPlanDays[].breakfast.media.dinner | object |  |
| mealPlanDays[].breakfast.media.snack1 | object |  |
| mealPlanDays[].breakfast.media.snack2 | object |  |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not exist |
| 406 | Parameter missing |
| 500 | code: 30 can't create the meal plan based on the inputs |

---

#### POST /mealPlan/set

**URL:** `https://api.trainerize.com/v03/mealPlan/set`

Save a new meal plan or update existing one.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/mealPlan/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 1234
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 1234 | [long - user id]; Format: int64 |
| mealPlan | object | No |  |  |
| mealPlan.mealPlanID | integer | No | 3333 | [long]; Format: int64 |
| mealPlan.mealPlanName | string | No | xxxxx | [string] |
| mealPlan.type | string | No |  | "TRZ" - with attachment 
"EN" - Evolution Nut meal plan 
[string] |
| mealPlan.enMealPlanID | string | No |  | [string] [required if type = 1] |
| mealPlan.attachment | object | No |  |  |
| mealPlan.attachment.attachmentID | string | No | xx | [required if type = 1] |
| mealPlan.caloricGoal | number | No | 123 | [decimal] |
| mealPlan.carbsGrams | number | No | 123 | [decimal] |
| mealPlan.carbsPercent | number | No | 123 | [decimal] |
| mealPlan.proteinGrams | number | No | 123 | [decimal] |
| mealPlan.proteinPercent | number | No | 123 | [decimal] |
| mealPlan.fatGrams | number | No | 123 | [decimal] |
| mealPlan.fatPercent | number | No | 123 | [decimal] |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| statusMsg | string | Example: OK |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not exist |
| 406 | Parameter missing |
| 500 | General server error |

---

### photos

#### POST /photos/getList

**URL:** `https://api.trainerize.com/v03/photos/getList`

Get list of photos

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/photos/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "startDate": "",
  "endDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes |  |  |
| startDate | string | Yes |  | Format: date |
| endDate | string | Yes |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| photos | array[object] |  |
| photos[].id | integer |  |
| photos[].date | string | Format: date |
| photos[].pose | string |  |
| total | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /photos/getByID

**URL:** `https://api.trainerize.com/v03/photos/getByID`

Get photo by Photo ID

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/photos/getByID \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "photoid": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  |  |
| photoid | integer | No |  |  |
| thumbnail | boolean | No |  |  |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | Photo not found |
| 500 | Server error |

---

#### POST /photos/add

**URL:** `https://api.trainerize.com/v03/photos/add`

Upload progress photos: request must be multipart/form-data, containing "file" field with the file binary, and "data" field with the JSON object with additional parameters.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/photos/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| ids | array[integer] |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

### program

#### POST /program/addUser

**URL:** `https://api.trainerize.com/v03/program/addUser`

Add a user to program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/addUser \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0,
  "startDate": "",
  "subscribeType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| userID | integer | No |  |  |
| startDate | string | No |  | Format: date |
| subscribeType | string | No |  | core or addon - [Multiple Programs beta only] 'core' is for Main Program, 'addon' is for Addon Program. Default - 'core'. |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /program/copyToUser

**URL:** `https://api.trainerize.com/v03/program/copyToUser`

Copy a program to a user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/copyToUser \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0,
  "startDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| userID | integer | No |  |  |
| startDate | string | No |  | Format: date |
| forceMerge | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /program/copyTrainingPlanToClient

**URL:** `https://api.trainerize.com/v03/program/copyTrainingPlanToClient`

Import a training plan into program from a user

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/copyTrainingPlanToClient \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "trainingPlanID": 0,
  "userID": 0,
  "startDate": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| trainingPlanID | integer | No |  |  |
| userID | integer | No |  |  |
| startDate | string | No |  | Format: date |
| forceMerge | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| trainingPlanID | integer |  |

---

#### POST /program/deleteUser

**URL:** `https://api.trainerize.com/v03/program/deleteUser`

Delete a user from program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/deleteUser \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| userID | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /program/get

**URL:** `https://api.trainerize.com/v03/program/get`

Get a program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | program id |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | program id |
| name | string |  |
| duration | integer | duration in days |
| accessLevel | string | shared, mine, other |
| userID | integer |  |
| isInUse | boolean | In there any client subscribed to program |

---

#### POST /program/getCalendarList

**URL:** `https://api.trainerize.com/v03/program/getCalendarList`

Get list of scheduled items on calendar

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/getCalendarList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 123,
  "startDay": 0,
  "endDay": 28
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 123 | Program id |
| startDay | integer | No | 0 | Start day of the calendar |
| endDay | integer | No | 28 | End day of the calendar |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| calender | array[object] |  |
| calender[].day | integer | Example: 1 |
| calender[].items | array[any] |  |

---

#### POST /program/getTrainingPlanList

**URL:** `https://api.trainerize.com/v03/program/getTrainingPlanList`

Get list of training plan belongs a program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/getTrainingPlanList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 123 | program id |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| trainingPlanID | integer | Example: 123 |
| name | string | Example: abc |
| duration | integer | Example: 7 |

---

#### POST /program/getList

**URL:** `https://api.trainerize.com/v03/program/getList`

Get list of programs

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "type": "",
  "tag": 0,
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| type | string | No |  | shared, mine, other, all - include shared and mine |
| tag | integer | No |  | 123, 456 ... 0 for programs without tags |
| userID | integer | No |  |  |
| includeHQ | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| programs | array[object] |  |
| programs[].id | integer | program id |
| programs[].name | string |  |
| programs[].duration | integer | duration in days |
| programs[].accessLevel | string | shared, mine, other |
| programs[].userID | integer |  |
| programs[].isInUse | boolean | In there any client subscribed to program |

---

#### POST /program/getUserList

**URL:** `https://api.trainerize.com/v03/program/getUserList`

Get a list of user belongs to program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/getUserList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "sort": "",
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| sort | string | No |  | name, startDate, userGroup |
| start | integer | No |  | null for all the users |
| count | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer | user id |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].startDate | string | Format: date |
| users[].userGroup | object |  |
| users[].userGroup.id | integer |  |
| users[].userGroup.name | string |  |
| users[].userGroup.type | string | trainingGroup, fitnessCommunity, nutritionCommunity, custom |
| users[].userGroup.icon | string | tr-emoji-apple |

---

#### POST /program/getUserProgramList

**URL:** `https://api.trainerize.com/v03/program/getUserProgramList`

Get user's list of programs

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/getUserProgramList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| userPrograms | array[any] |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /program/move

**URL:** `https://api.trainerize.com/v03/program/move`

Move a program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/move \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0,
  "type": "",
  "forceType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| userID | integer | No |  |  |
| type | string | No |  | shared, mine, other |
| forceType | string | No |  | rename |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

---

#### POST /program/setUserProgram

**URL:** `https://api.trainerize.com/v03/program/setUserProgram`

Change startDate or subscripeType (Can only switch from addon to core) for a user's program

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/program/setUserProgram \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userProgramID": 0,
  "userID": 0,
  "startDate": "",
  "subscribeType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userProgramID | integer | No |  | Leave it as null to switch customer program. |
| userID | integer | Yes |  |  |
| startDate | string | No |  | Format: date |
| subscribeType | string | No |  | can only switch an addon program to core |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

### trainingPlan

#### POST /trainingPlan/add

**URL:** `https://api.trainerize.com/v03/trainingPlan/add`

adds a reply to thread

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainingPlan/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userid": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userid | integer | No |  |  |
| plan | object | No |  |  |
| plan.id | integer | No |  | training plan id |
| plan.name | string | No |  | training plan name |
| plan.instruction | string | No |  |  |
| plan.startDate | string | No |  | Format: date |
| plan.duration | integer | No |  |  |
| plan.durationType | string | No |  | specificDate, week, month, notSpecified |
| plan.endDate | string | No |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | training plan id |
| name | string | training plan name |
| instruction | string |  |
| startDate | string | Format: date |
| duration | integer |  |
| durationType | string | specificDate, week, month, notSpecified |
| endDate | string | Format: date |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. Client can only access own data. |
| 404 | Thread not found |
| 500 | General server error |

---

#### POST /trainingPlan/delete

**URL:** `https://api.trainerize.com/v03/trainingPlan/delete`

runs a clear first, then deletes the training plan. associated scheduled workouts should be removed from the calendar. deletes the specified training plan.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainingPlan/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "planid": 0,
  "closeGap": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| planid | integer | No |  | training plan id to delete |
| closeGap | integer | No |  | 1, 0 |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. Client can only access own data. |
| 404 | Thread not found |
| 500 | General server error |

---

#### POST /trainingPlan/getList

**URL:** `https://api.trainerize.com/v03/trainingPlan/getList`

Gets a list of all training plans

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainingPlan/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userid": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userid | integer | No |  | client to get training plans |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| plans | array[object] |  |
| plans[].id | integer | training plan id |
| plans[].name | string | training plan name |
| plans[].instruction | string |  |
| plans[].startDate | string | Format: date |
| plans[].duration | integer |  |
| plans[].durationType | string | specificDate, week, month, notSpecified |
| plans[].endDate | string | Format: date |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. Client can only access own data. |
| 404 | Thread not found |
| 500 | General server error |

---

#### POST /trainingPlan/getWorkoutDefList

**URL:** `https://api.trainerize.com/v03/trainingPlan/getWorkoutDefList`

Get a list of the workout definitions.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainingPlan/getWorkoutDefList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "planID": 0,
  "searchTerm": "",
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| planID | integer | No |  | [int] |
| searchTerm | string | No |  | Workout 1 |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |
| filter | object | No |  |  |
| filter.equipments | array | No | ['bands', 'barbell'] | bands, superband, miniband, lacrosseBall, barbell, bodyWeight, 
cable, dumbbell, dring, ezBar, foamRoller,kettlebells,
 machine, medicineBall, swissBall, balanceBoard, trx, sliders,
 jumpRope, box, bike, bench, bosu, cone,
 smithMachine, stabilityBall, steelBell, sandBag, partner, mat,
 pullUpBar, battlingRope, plyoBox, lightWeight, 6InchBox, 12InchBox,
 18InchBox, landmine, halfRoller, ropeHandle, hurdle, agilityLadder,
 sled, rope, tape, powerWheel, plate |
| filter.duration | integer | No | 10 | duration in minutes: null, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 999 (999 includes 60+) |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer | Example: 10 |
| workout | array[any] |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. Client can only access own data. |
| 404 | Thread not found |
| 500 | General server error |

---

### trainerNote

#### POST /trainerNote/add

**URL:** `https://api.trainerize.com/v03/trainerNote/add`

adds the note

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainerNote/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "content": "",
  "type": "",
  "attachTo": 123,
  "injury": false
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| content | string | No |  | Please add payment |
| type | string | No |  | general, workout |
| attachTo | integer | No | 123 | dailyWorkoutID mandatory for type workout |
| injury | boolean | No | False | Optional default false |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Example: 123 |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user trainer notes. |
| 404 | User not found. |
| 500 | General server error |

---

#### POST /trainerNote/get

**URL:** `https://api.trainerize.com/v03/trainerNote/get`

Get trainer note by type, attachTo, attachToUser

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainerNote/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "type": "",
  "attachTo": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 | client's ID |
| type | string | No |  | workout |
| attachTo | integer | No | 123 | Attached object ID |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | Example: 123 |
| content | string | Please add payment |
| type | string | workout, general |
| injury | boolean |  |
| createdBy | object |  |
| createdBy.id | integer | Example: 123 |
| createdBy.firstName | string | ricky |
| createdBy.lastName | string | ying |
| date | string | "[YYYY-MM-DD] [HH:MM]", (timezone UTC); Format: date |
| attachData | object |  |
| attachData.id | integer | Example: 123 |
| attachData.type | string | dailyWorkout, dailyCardio |
| attachData.name | string | Workout1 |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user trainer notes. |
| 404 | User not found. |
| 500 | General server error |

---

#### POST /trainerNote/getList

**URL:** `https://api.trainerize.com/v03/trainerNote/getList`

gets all the trainers notes, order by injury first, then by most recent first

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainerNote/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "searchTerm": "",
  "start": 10,
  "count": 10,
  "filterType": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| searchTerm | string | No |  | abcd |
| start | integer | No | 10 |  |
| count | integer | No | 10 |  |
| filterType | string | No |  | general, pinned, workout |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer | Example: 10 |
| trainerNotes | array[object] |  |
| trainerNotes[].id | integer | Example: 123 |
| trainerNotes[].content | string | Please add payment |
| trainerNotes[].type | string | workout, general |
| trainerNotes[].injury | boolean |  |
| trainerNotes[].createdBy | object |  |
| trainerNotes[].createdBy.id | integer | Example: 123 |
| trainerNotes[].createdBy.firstName | string | ricky |
| trainerNotes[].createdBy.lastName | string | ying |
| trainerNotes[].date | string | "[YYYY-MM-DD] [HH:MM]", (timezone UTC); Format: date |
| trainerNotes[].attachData | object |  |
| trainerNotes[].attachData.id | integer | Example: 123 |
| trainerNotes[].attachData.type | string | dailyWorkout, dailyCardio |
| trainerNotes[].attachData.name | string | Workout1 |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user trainer notes. |
| 404 | User not found. |
| 500 | General server error |

---

#### POST /trainerNote/set

**URL:** `https://api.trainerize.com/v03/trainerNote/set`

save the note

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/trainerNote/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 123,
  "content": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No | 123 |  |
| content | string | No |  | Please add payment |
| injury | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | Example: 0 |
| message | string | Trainer notes updated |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user trainer notes. |
| 404 | User not found / Note not found. |
| 500 | General server error |

---

### user

#### POST /user/add

**URL:** `https://api.trainerize.com/v03/user/add`

this function will add a trainer or client

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "user": {
    "email": "clien52@dimsum.com",
    "firstName": "Siu",
    "lastName": "Longbao",
    "locationID": 1266,
    "trainerID": 673594,
    "type": "client",
    "settings": {
      "enableSignin": true,
      "enableMessage": true
    }
  }
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| user | object | No |  |  |
| user.firstName | string | No | Michelle |  |
| user.lastName | string | No | White |  |
| user.fullName | string | No | Michelle White | either fullName or firstname + lastname need to be provided. |
| user.type | string | No | client | "client", "trainer", "regularClient" |
| user.email | string | No |  |  |
| user.trainerID | integer | No | 123 | if null, assigned to owner |
| user.locations | array | No |  | when adding a trainer - at least one locationID |
| user.locationID | integer | No | 123 | when adding a client - if null, client is assigned to the first location in group |
| user.phone | string | No | 143-1233 |  |
| user.country | string | No |  | Country code (throws 406 error if incorrect match) |
| user.city | string | No |  |  |
| user.sex | string | No |  | "male" or "female" or null |
| user.birthDate | string | No |  | YYYY-MM-DD |
| user.height | integer | No |  | in inch or cm, depending unitHeight |
| user.skypeID | string | No |  |  |
| user.enID | string | No |  |  |
| user.status | string | No |  | "active", "deactivated", "pending" |
| user.settings | object | No |  |  |
| user.settings.unitBodystats | string | No |  | "cm", "inches" (anything settings, prefix with settings) inherits from signedIn user if null |
| user.settings.unitDistance | string | No |  | "km", "miles", inherits from signedIn user if null |
| user.settings.unitWeight | string | No |  | "kg", "lbs", inherits from signedIn user if null |
| user.settings.RemindMe | string | No |  | like 8am, 9pm or Off, defaults to 10am iif null |
| user.settings.enableSignin | boolean | No |  |  |
| user.settings.enableMessage | boolean | No |  |  |
| user.settings.scheduleWorkoutReminder | boolean | No |  |  |
| program | object | No |  | program to add the user into |
| program.programID | integer | No |  |  |
| program.startDate | string | No |  | 2017-01-01 |
| userGroupID | integer | No |  | user group to add the user into |
| userTag | string | No |  | user tag to add user |
| password | string | No |  |  |
| sendMail | boolean | No |  |  |
| isSetup | boolean | No |  | true - to byPass the setup process for user, default false |
| unitHeight | string | No |  | inch or cm, if Height specified then must have the unitHeight |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| userID | integer |  |
| message | string |  |
| code | integer | 0 - user created successfully; 1 - client created but added to the pending list queue as over limit |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to create client or trainer |
| 406 | Firstname, Lastname, Email, Type is required; invalid country/timezone/email/type/height/unitBodyStats/unitDistance/unitWeight; email already taken |
| 500 | General server error |

---

#### POST /user/addTag

**URL:** `https://api.trainerize.com/v03/user/addTag`

add the user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/addTag \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "userTag": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| userTag | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| statusMsg | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. |
| 500 | General server error |

---

#### POST /user/deleteTag

**URL:** `https://api.trainerize.com/v03/user/deleteTag`

delete the user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/deleteTag \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "userTag": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| userTag | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| statusMsg | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. |
| 500 | General server error |

---

#### POST /user/delete

**URL:** `https://api.trainerize.com/v03/user/delete`

this function will delete a trainer or client

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673689,
  "toUserID": 673672,
  "transferContent": true
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| transferContentToUser | integer | No | 234 | Trainer to transfer the content to (Master Workout/Program) |
| transferClientToUser | integer | No | 234 | Trainer to transfer the client to |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| Result | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No privilege to access user |
| 404 | User Not Found |
| 500 | General server error |

---

#### POST /user/find

**URL:** `https://api.trainerize.com/v03/user/find`

Search the user by firstname, lastname or email, sort by user's firstname, lastname

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/find \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "searchTerm": "Ricky Ying",
  "view": "recipient",
  "sort": "",
  "includeBasicMember": false,
  "start": 0,
  "count": 10,
  "verbose": false
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| searchTerm | string | No | Ricky Ying | [string view type optional] |
| view | string | No | recipient | "recipient", "activeClientPicker", "allClient",  "activeClient", "pendingClient", "deactivatedClient", "trainer" - trainer will always sort by name |
| sort | string | No |  | "name", "dateAdded", "lastSignedIn", "lastMessaged", "lastTrainingPlanEndDate", "role" |
| includeBasicMember | boolean | No | False | default false.  Works with activeClientPicker. recipient, activeClient won't include basic member. Other views will always include the basic member |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |
| verbose | boolean | No | False | true -- Include extra fields or not. |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer | Example: 123 |
| users[].firstName | string | Example: Michelle |
| users[].lastName | string | Example: White |
| users[].type | string | Example: client |
| users[].role | string | "fullAccess", "fullAccessWithOneWayMessage", "offline", "basic" |
| users[].email | string | Example: a@a.com |
| users[].status | string | Example: "active", "deactivated", "pending" |
| users[].latestSignedIn | string | [YYYY-MM-DD]; Format: date; Example: 2020-01-01 |
| users[].profileName | string | Example: ricky.ying |
| users[].profileIconUrl | string | [string], S3 URL for accessing icon |
| users[].profileIconVersion | integer | Example: 12 |
| users[].details | object | --verbose mode |
| users[].details.phone | integer | phone number; Example: 1234 |
| users[].details.trainer | object |  |
| users[].details.trainer.id | integer | Example: 12 |
| users[].details.trainer.firstName | string | Example: aa |
| users[].details.trainer.lastName | string | Example: def |
| total | integer | Example: 10 |

---

#### POST /user/getClientList

**URL:** `https://api.trainerize.com/v03/user/getClientList`

Gets a list of clients according to the view

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getClientList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "locationID": 0,
  "view": "",
  "sort": "",
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No |  | trainer to get client for, by default will be current signed in trainer |
| locationID | integer | No |  |  Get all the clients under one location, user has to specify either location or trainer ID for activeClient View. |
| view | string | No |  | "allActive", "activeClient", "pendingClient", "deactivatedClient" |
| filter | object | No |  |  |
| filter.role | string | No |  | fullAccess, fullAccessWithOneWayMessage, offline, basic |
| filter.systemTag | string | No |  | notSetup, personalBestLately, notSignedInLately, needTrainingPlan, needTrainingPlanSoon,  lowNutritionCompliance, highNutritionCompliance, lowWorkoutCompliance, highWorkoutCompliance, notMessagedLately, notResponsedLately, hasNutritionGoal, failingPayments |
| filter.userTag | integer | No |  | User tag as filter |
| filter.currentPlanID | integer | No |  |  |
| filter.nextPlanID | integer | No |  |  |
| filter.programID | integer | No |  |  |
| filter.userGroupID | integer | No |  |  |
| filter.systemTags | array[string] | No |  |  |
| filter.userTags | array[integer] | No |  |  |
| sort | string | No |  | name, dateAdded, lastSignedIn, lastMessaged, lastTrainingPlanEndDate |
| start | integer | No |  |  |
| count | integer | No |  |  |
| verbose | boolean | No |  | false, true -- Include extra fields or not. |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer |  |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].type | string |  |
| users[].role | string | fullAccess, fullAccessWithOneWayMessage, offline, basic |
| users[].email | string |  |
| users[].status | string | active, deactivated, pending |
| users[].profileName | string |  |
| users[].trainerID | integer |  |
| users[].profileIconVersion | integer |  |
| users[].profileIconUrl | string | S3 URL for accessing icon |
| users[].detail | object | verbose mode |
| users[].detail.phone | integer |  |
| users[].detail.trainer | object |  |
| users[].detail.trainer.id | integer |  |
| users[].detail.trainer.firstName | string |  |
| users[].detail.trainer.lastName | string |  |
| total | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /user/getClientSummary

**URL:** `https://api.trainerize.com/v03/user/getClientSummary`

Get client's summary data

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getClientSummary \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 0,
  "unitWeight": "lbs"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes |  | client to get stats |
| unitWeight | string | No | lbs | kg or lbs |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| workoutsTotal | integer |  |
| cardioTotal | integer |  |
| photosTotal | integer |  |
| messageTotal | integer |  |
| lastPhotoID | integer |  |
| lastWeight | integer |  |
| lastWeightDate | string | date: YYYY-MM-DD |
| lastMessageDate | string | date: YYYY-MM-DD |
| lastFMS | object |  |
| lastFMS.date | string | date: YYYY-MM-DD |
| lastFMS.score | integer |  |
| mfpConnected | boolean |  |
| userPrograms | array[object] |  |
| userPrograms[].userProgramID | integer |  |
| userPrograms[].id | integer | ProgramID |
| userPrograms[].name | string | Program Name |
| userPrograms[].subscribeType | string | core or addon |
| userPrograms[].durationType | string | phased or ondemand |
| userPrograms[].startDate | string | date: YYYY-MM-DD |
| userPrograms[].endDate | string | date: YYYY-MM-DD |
| userPrograms[].accessLevel | string | shared, mine, other, custom |
| userPrograms[].userGroup | object |  |
| userPrograms[].userGroup.id | integer |  |
| userPrograms[].userGroup.name | string |  |
| userPrograms[].userGroup.type | string | trainingGroup, fitnessCommunity, nutritionCommunity, custom |
| userPrograms[].userGroup.icon | string |  |
| program | object |  |
| program.programID | integer |  |
| program.name | string |  |
| program.startDate | string | date: YYYY-MM-DD |
| program.endDate | string | date: YYYY-MM-DD |
| trainingPlan | object |  |
| trainingPlan.id | integer |  |
| trainingPlan.type | string | timeOff, regular |
| trainingPlan.name | string |  |
| trainingPlan.startDate | string | date: YYYY-MM-DD |
| trainingPlan.duration | integer |  |
| trainingPlan.durationType | string |  |
| trainingPlan.endDate | string | date: YYYY-MM-DD |
| nextTrainingPlan | object |  |
| nextTrainingPlan.id | integer |  |
| nextTrainingPlan.type | string | timeOff, regular |
| nextTrainingPlan.name | string |  |
| nextTrainingPlan.startDate | string | date: YYYY-MM-DD |
| nextTrainingPlan.duration | integer |  |
| nextTrainingPlan.durationType | string |  |
| nextTrainingPlan.endDate | string | date: YYYY-MM-DD |
| weeklyStats | array[object] |  |
| weeklyStats[].week | integer | 0 - this week, 1 - next week, -1 - previous week, -2 - 2 weeks before, -3 - 3 weeks before |
| weeklyStats[].startDate | string | date: YYYY-MM-DD. Monday of the week |
| weeklyStats[].endDate | string | date: YYYY-MM-DD. Sunday of the week |
| weeklyStats[].workoutCompleted | integer |  |
| weeklyStats[].workoutScheduled | integer |  |
| weeklyStats[].cardioCompleted | integer |  |
| weeklyStats[].cardioScheduled | integer |  |
| weeklyStats[].workoutCompliance | integer |  |
| weeklyStats[].nutritionCompleted | integer |  |
| weeklyStats[].nutritionCompliance | integer |  |
| weeklyStats[].clientWorkoutCompleted | integer |  |
| weeklyStats[].clientCardioCompleted | integer |  |
| weeklyStats[].numberOfSignIn | integer |  |
| weeklyStats[].goal | object |  |
| weeklyStats[].goal.nutrition | object |  |
| mealPlan | object |  |
| mealPlan.id | integer |  |
| mealPlan.name | string |  |
| mealPlan.type | string | file, EN |
| currentSubscription | object |  |
| currentSubscription.subscriptionID | integer |  |
| currentSubscription.plan | object |  |
| currentSubscription.plan.planID | integer | Product ID |
| currentSubscription.plan.planType | string |  |
| currentSubscription.plan.name | string |  |
| currentSubscription.plan.description | string |  |
| currentSubscription.plan.image | object |  |
| currentSubscription.plan.image.id | integer | File ID |
| currentSubscription.plan.isListed | boolean |  |
| currentSubscription.plan.amount | integer | in cents |
| currentSubscription.plan.currency | string |  |
| currentSubscription.plan.interval | integer | null for package |
| currentSubscription.plan.intervalType | string | day, week, month, year; null for package |
| currentSubscription.plan.created | string | created in utc |
| currentSubscription.plan.modified | string | modified in utc |
| currentSubscription.plan.numberOfClients | integer |  |
| currentSubscription.firstPaymentDate | string | start date in utc |
| currentSubscription.startDate | string | start date in utc |
| currentSubscription.nextRenewDate | string | next billing date in utc |
| currentSubscription.endDate | string | end date in utc |
| currentSubscription.status | string | pending, upcoming, active, expired, canceled, failing, failed |
| currentSubscription.created | string | created in utc |
| currentSubscription.modified | string | modified in utc |
| nextSubscription | object |  |
| nextSubscription.subscriptionID | integer |  |
| nextSubscription.plan | object |  |
| nextSubscription.plan.planID | integer | Product ID |
| nextSubscription.plan.planType | string |  |
| nextSubscription.plan.name | string |  |
| nextSubscription.plan.description | string |  |
| nextSubscription.plan.image | object |  |
| nextSubscription.plan.image.id | integer | File ID |
| nextSubscription.plan.isListed | boolean |  |
| nextSubscription.plan.amount | integer | in cents |
| nextSubscription.plan.currency | string |  |
| nextSubscription.plan.interval | integer | null for package |
| nextSubscription.plan.intervalType | string | day, week, month, year; null for package |
| nextSubscription.plan.created | string | created in utc |
| nextSubscription.plan.modified | string | modified in utc |
| nextSubscription.plan.numberOfClients | integer |  |
| nextSubscription.firstPaymentDate | string | start date in utc |
| nextSubscription.startDate | string | start date in utc |
| nextSubscription.nextRenewDate | string | next billing date in utc |
| nextSubscription.endDate | string | end date in utc |
| nextSubscription.status | string | pending, upcoming, active, expired, canceled, failing, failed |
| nextSubscription.created | string | created in utc |
| nextSubscription.modified | string | modified in utc |
| defaultCard | object |  |
| defaultCard.cardID | string |  |
| defaultCard.name | string |  |
| defaultCard.brand | string | Visa, American Express, MasterCard, Unknown |
| defaultCard.funding | string | credit, debit, prepaid, unknown |
| defaultCard.last4 | string |  |
| defaultCard.expirationMonth | integer |  |
| defaultCard.expirationYear | integer |  |
| defaultCard.cvcCheck | string | pass, fail, unavailable, unchecked |
| defaultCard.fingerPrint | string |  |
| goal | object |  |
| goal.weight | object |  |
| goal.nutrition | object |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /user/getTrainerList

**URL:** `https://api.trainerize.com/v03/user/getTrainerList`

Gets a list of trainers according to the user privilege Owner/Admin see all trainers Manange/Shared trainer see all trainers in their location Trainer will not able to see any other trainers

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getTrainerList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "locationID": 1268,
  "sort": "name",
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| locationID | integer | No | 1268 | Search for all location user can access if there is no location id. |
| sort | string | No | name | name, role, lastSignedIn |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer |  |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].type | string |  |
| users[].role | string | fullAccess, fullAccessWithOneWayMessage, offline, basic |
| users[].email | string |  |
| users[].status | string | active, deactivated, pending |
| users[].profileName | string |  |
| users[].trainerID | integer |  |
| users[].profileIconVersion | integer |  |
| users[].profileIconUrl | string | S3 URL for accessing icon |
| users[].detail | object | verbose mode |
| users[].detail.phone | integer |  |
| users[].detail.trainer | object |  |
| users[].detail.trainer.id | integer |  |
| users[].detail.trainer.firstName | string |  |
| users[].detail.trainer.lastName | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 404 | User not found |
| 406 | No view provided |
| 500 | General server error |
| 501 | view not implemented |

---

#### POST /user/getProfile

**URL:** `https://api.trainerize.com/v03/user/getProfile`

takes an array of userIDs and returns the user profile. client can get their own profile. trainer can get anyone in their group.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getProfile \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": [
    "12345",
    "22222"
  ],
  "unitBodystats": "cm"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| usersid | array[integer] | No |  |  |
| unitBodystats | string | No |  | "cm", "inches". The height goes in this unit. If unitBodystats not exist returns in cm |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer |  |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].type | string | "client", "trainer" |
| users[].trainerID | integer |  |
| users[].trainerName | string |  |
| users[].phone | string |  |
| users[].email | string |  |
| users[].country | string |  |
| users[].city | string |  |
| users[].sex | string | "male" or "female" or null |
| users[].birthDate | string | YYYY-MM-DD |
| users[].height | integer | in inch or cm, depending unitHeight |
| users[].skypeID | string |  |
| users[].injuryLimitations | string |  |
| users[].hasTestClient | boolean |  |
| users[].latestMessageDate | string |  |
| users[].latestResponseDate | string |  |
| users[].settings | object |  |
| users[].settings.unitBodystats | string | "cm", "inches" (anything settings, prefix with settings) inherits from signedIn user if null |
| users[].settings.unitDistance | string | "km", "miles", inherits from signedIn user if null |
| users[].settings.unitWeight | string | "kg", "lbs", inherits from signedIn user if null |
| users[].settings.RemindMe | string | like 8am, 9pm or Off, defaults to 10am iif null |
| users[].settings.enableSignin | boolean |  |
| users[].settings.enableMessage | boolean |  |
| users[].settings.scheduleWorkoutReminder | boolean |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /user/getSettings

**URL:** `https://api.trainerize.com/v03/user/getSettings`

Set user status

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getSettings \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | Yes | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| firstName | string |  |
| lastName | string |  |
| timezone | integer |  |
| unitWeight | string | kg, lbs |
| unitDistance | string | km, miles |
| unitBodystat | string | cm, inches |
| reminderTime | integer | 5 - 22; valid value 5AM to 10PM |
| level | integer | 0 - regular trainer 
 10 - super trainer [not implemented] 
 20 - admin (sees everyone, change any setting other than billing) 
 30 - owner (all unlocked - can change biling) |
| trainerID | integer | returned only if this user is a client |
| skypeEnabled | boolean | if group plan = free, false; else true |
| withingsConnected | boolean |  |
| mobileVideoQuality | integer | 1 - AlwaysHD, 2 - HDOnWifi, 3 - AlwaysFastest |
| fbLandingPage | string | xxx.trainerize.com or abc.com |
| mfpConnected | boolean |  |
| fitbitConnected | boolean |  |
| mfpUsername | boolean |  |
| hasMobileSetup | boolean |  |
| hasMobileTrackerWizard | boolean |  |
| hasMobileSwitchIntoWizard | boolean |  |
| hasMobileAddonBanner | boolean |  |
| hasMobileCustomExerciseBanner | boolean |  |
| hasMobileReferralBanner | boolean |  |
| hasMobileFreeStyleWorkout | boolean |  |
| hasUploadedTestExerciseVideo | boolean |  |
| hasNewNotification | boolean |  |
| hasEmailAddressError | boolean |  |
| nutritionTrackingPerference | string | e.g. trackWithMFP |
| email | object |  |
| email.newMessage | boolean | Both client/trainer |
| email.newUserGroupMessage | boolean | Both client/trainer |
| email.comment | boolean | Both client/trainer |
| email.reminders | boolean | Client |
| email.trainerUpdates | boolean | trainer |
| email.clientDailySummary | boolean | trainer |
| email.weeklyFollowup | boolean | trainer |
| email.news | boolean | trainer |
| email.paymentEvent | boolean | trainer |
| email.zapierEvents | boolean | trainer |
| email.clientFirstWorkout | boolean | trainer |
| email.clientSubsequentWorkout | boolean | trainer |
| email.clientMilestoneCardio | boolean | trainer |
| email.clientAllCardio | boolean | trainer |
| email.clientHitGoal | boolean | trainer |
| notification | object |  |
| notification.newMessage | boolean | Both client/trainer |
| notification.newUserGroupMessage | boolean | Both client/trainer |
| notification.comment | boolean | Both client/trainer |
| notification.paymentEvent | boolean | Both client/trainer |
| notification.reminders | boolean | Client |
| notification.trainerUpdates | boolean | Client |
| notification.clientPersonalBest | boolean | trainer |
| notification.clientFirstWorkout | boolean | trainer |
| notification.clientSubsequentWorkout | boolean | trainer |
| notification.clientMilestoneCardio | boolean | trainer |
| notification.clientAllCardio | boolean | trainer |
| notification.zapierEvents | boolean | trainer |
| notification.clientHitGoal | boolean | trainer |
| timeline | object |  |
| timeline.showMissWorkout | boolean |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | No authorized. Check user’s is setting their own setting Cannot set another user’s setting. |
| 500 | General server error |

---

#### POST /user/getSetupLink

**URL:** `https://api.trainerize.com/v03/user/getSetupLink`

takes an userID and returns the setup link for the new account takes an array of userIDs and returns the user profile. client can get their own profile. trainer can get anyone in their group.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getSetupLink \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| url | string | https://xxx.trainerize.com/app/setup/?mode=setup&userid=xxx&token=xxxxx |
| expire | string | YYYY-MM-DD; Format: date |

---

#### POST /user/getLoginToken

**URL:** `https://api.trainerize.com/v03/user/getLoginToken`

Get one time login token. To automatically log user in, append the token with the userid as a query string to the login page. https://xxxx.trainerize.com/app/logon.aspx?userid=xxxx&logintoken=xxxx

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/getLoginToken \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "duration": "3600",
  "able": false
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| duration | integer | No | 3600 | duration in seconds,  12 hour max |
| able | boolean | No | False | token is reusable or one time usage |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| token | string |  |
| expireAt | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /user/switchTrainer

**URL:** `https://api.trainerize.com/v03/user/switchTrainer`

Switch client's trainer

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/switchTrainer \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "email": "ricky@trainerize.com",
  "trainerID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| email | string | No | ricky@trainerize.com |  |
| trainerID | integer | No | 123 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /user/setProfile

**URL:** `https://api.trainerize.com/v03/user/setProfile`

takes an array of users and properties and saves the user profile for each element in the array. Client can save their own profile. Trainer can save anyone in their group.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/setProfile \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": [
    "12345",
    "22222"
  ],
  "unitBodystats": "cm"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| unitBodystats | string | No |  | "cm", "inches". The height goes in this unit. If unitBodystats not exist returns in cm |
| user | object | No |  |  |
| user.id | integer | No |  |  |
| user.firstName | string | No |  |  |
| user.lastName | string | No |  |  |
| user.type | string | No |  | "client", "trainer" |
| user.trainerID | integer | No |  |  |
| user.trainerName | string | No |  |  |
| user.phone | string | No |  |  |
| user.email | string | No |  |  |
| user.country | string | No |  |  |
| user.city | string | No |  |  |
| user.sex | string | No |  | "male" or "female" or null |
| user.birthDate | string | No |  | YYYY-MM-DD |
| user.height | integer | No |  | in inch or cm, depending unitHeight |
| user.skypeID | string | No |  |  |
| user.injuryLimitations | string | No |  |  |
| user.hasTestClient | boolean | No |  |  |
| user.latestMessageDate | string | No |  |  |
| user.latestResponseDate | string | No |  |  |
| user.settings | object | No |  |  |
| user.settings.unitBodystats | string | No |  | "cm", "inches" (anything settings, prefix with settings) inherits from signedIn user if null |
| user.settings.unitDistance | string | No |  | "km", "miles", inherits from signedIn user if null |
| user.settings.unitWeight | string | No |  | "kg", "lbs", inherits from signedIn user if null |
| user.settings.RemindMe | string | No |  | like 8am, 9pm or Off, defaults to 10am iif null |
| user.settings.enableSignin | boolean | No |  |  |
| user.settings.enableMessage | boolean | No |  |  |
| user.settings.scheduleWorkoutReminder | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer |  |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].type | string | "client", "trainer" |
| users[].trainerID | integer |  |
| users[].trainerName | string |  |
| users[].phone | string |  |
| users[].email | string |  |
| users[].country | string |  |
| users[].city | string |  |
| users[].sex | string | "male" or "female" or null |
| users[].birthDate | string | YYYY-MM-DD |
| users[].height | integer | in inch or cm, depending unitHeight |
| users[].skypeID | string |  |
| users[].injuryLimitations | string |  |
| users[].hasTestClient | boolean |  |
| users[].latestMessageDate | string |  |
| users[].latestResponseDate | string |  |
| users[].settings | object |  |
| users[].settings.unitBodystats | string | "cm", "inches" (anything settings, prefix with settings) inherits from signedIn user if null |
| users[].settings.unitDistance | string | "km", "miles", inherits from signedIn user if null |
| users[].settings.unitWeight | string | "kg", "lbs", inherits from signedIn user if null |
| users[].settings.RemindMe | string | like 8am, 9pm or Off, defaults to 10am iif null |
| users[].settings.enableSignin | boolean |  |
| users[].settings.enableMessage | boolean |  |
| users[].settings.scheduleWorkoutReminder | boolean |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. (Trainer but userID is outside of trainer s group). Client can only access own data |
| 404 | User not found. Return as many as you can. this is if 0 users returned |
| 406 | Unable to understand body stats, date, country, or sex |
| 500 | General server error |

---

#### POST /user/setStatus

**URL:** `https://api.trainerize.com/v03/user/setStatus`

Set user status

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/setStatus \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 1234,
  "email": "ricky@trainerize.com",
  "accountStatus": "active",
  "enableSignin": true,
  "enableMessage": true
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| email | string | No | ricky@trainerize.com |  |
| accountStatus | string | No |  | "active", "deactivated", "pending" |
| enableSignin | boolean | No |  |  |
| enableMessage | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /user/setPrivilege

**URL:** `https://api.trainerize.com/v03/user/setPrivilege`

Change user's privilege

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/setPrivilege \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123,
  "role": "trainer"
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| role | string | No | trainer | trainer, sharedTrainer, manager, admin |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /user/setTag

**URL:** `https://api.trainerize.com/v03/user/setTag`

set the user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/user/setTag \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 123
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 123 |  |
| userTags | array[string] | No |  | Array of user tag |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| statusMsg | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. UserID is outside of group. Signed in user can only access this group’s templates. |
| 500 | General server error |

---

### userNotification

#### POST /userNotification/getUnreadCount

**URL:** `https://api.trainerize.com/v03/userNotification/getUnreadCount`

Get count of unread user notifications

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userNotification/getUnreadCount \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "userID": 673594
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| userID | integer | No | 673594 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

### userTag

#### POST /userTag/add

**URL:** `https://api.trainerize.com/v03/userTag/add`

add user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userTag/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "name": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer | user tag ID |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /userTag/delete

**URL:** `https://api.trainerize.com/v03/userTag/delete`

delete user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userTag/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "name": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /userTag/getList

**URL:** `https://api.trainerize.com/v03/userTag/getList`

Get all user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userTag/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| userTags | array[object] |  |
| userTags[].id | integer |  |
| userTags[].name | string |  |
| userTags[].type | string | userTag, staticTag |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /userTag/rename

**URL:** `https://api.trainerize.com/v03/userTag/rename`

rename user tag

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userTag/rename \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "oldName": "",
  "newName": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| oldName | string | No |  |  |
| newName | string | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

### userGroup

#### POST /userGroup/add

**URL:** `https://api.trainerize.com/v03/userGroup/add`

Add an UserGroup

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "name": "",
  "icon": "",
  "type": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| name | string | No |  |  |
| icon | string | No |  | tr-emoji-apple |
| type | string | No |  | trainingGroup, fitnessCommunity, nutritionCommunicty, custom |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer |  |
| threadID | integer | The thread id for the user group |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/addUser

**URL:** `https://api.trainerize.com/v03/userGroup/addUser`

Add an user to user group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/addUser \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "email": "",
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | user group id |
| email | string | No |  |  |
| userID | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /userGroup/deleteUser

**URL:** `https://api.trainerize.com/v03/userGroup/deleteUser`

Remove a user from user group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/deleteUser \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "userID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | user group id |
| userID | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. |
| 500 | General server error |

---

#### POST /userGroup/delete

**URL:** `https://api.trainerize.com/v03/userGroup/delete`

Delete a UserGroup

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/delete \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/get

**URL:** `https://api.trainerize.com/v03/userGroup/get`

Delete a UserGroup

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| id | integer |  |
| name | string |  |
| icon | string |  |
| type | string | trainingGroup, fitnessCommunity, nutritionCommunity, custom |
| threadID | integer | Thread ID for receive all messages |
| unread | boolean |  |
| totalUnreadMessages | integer |  |
| isCurrentUserInGroup | boolean |  |
| masterProgram | object |  |
| masterProgram.id | integer |  |
| masterProgram.duration | integer |  |
| masterProgram.name | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/getList

**URL:** `https://api.trainerize.com/v03/userGroup/getList`

Get List of User group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "view": "",
  "start": 0,
  "count": 10
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| view | string | No |  | all, mine |
| start | integer | No | 0 |  |
| count | integer | No | 10 |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| userGroups | array[object] |  |
| userGroups[].id | integer |  |
| userGroups[].name | string |  |
| userGroups[].icon | string |  |
| userGroups[].type | string | trainingGroup, fitnessCommunity, nutritionCommunity, custom |
| userGroups[].threadID | integer | Thread ID for receive all messages |
| userGroups[].unread | boolean |  |
| userGroups[].totalUnreadMessages | integer |  |
| userGroups[].isCurrentUserInGroup | boolean |  |
| userGroups[].masterProgram | object |  |
| userGroups[].masterProgram.id | integer |  |
| userGroups[].masterProgram.duration | integer |  |
| userGroups[].masterProgram.name | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 500 | General server error |

---

#### POST /userGroup/getAddons

**URL:** `https://api.trainerize.com/v03/userGroup/getAddons`

Get addons for user group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/getAddons \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | user group id |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| addOns | object |  |
| addOns.autoPostActivity | object |  |
| addOns.autoPostActivity.enabled | boolean |  |
| addOns.autoPostNutrition | object |  |
| addOns.autoPostNutrition.enabled | boolean |  |
| addOns.autoPostGoal | object |  |
| addOns.autoPostGoal.enabled | boolean |  |
| addOns.masterProgram | object |  |
| addOns.masterProgram.enabled | boolean |  |
| addOns.masterProgram.program | object |  |
| addOns.masterProgram.program.id | integer |  |
| addOns.masterProgram.program.name | string |  |
| addOns.masterProgram.startType | string | specificDate, joinDate |
| addOns.masterProgram.startDate | string | Format: date |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/getUserList

**URL:** `https://api.trainerize.com/v03/userGroup/getUserList`

Get addons for user group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/getUserList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | user group id |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| users | array[object] |  |
| users[].id | integer | user id |
| users[].firstName | string |  |
| users[].lastName | string |  |
| users[].profileIconUrl | string | S3 URL for accessing icon |
| users[].type | string | trainer, client |
| total | integer |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/set

**URL:** `https://api.trainerize.com/v03/userGroup/set`

Update a UserGroup

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0,
  "name": "",
  "icon": ""
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  |  |
| name | string | No |  |  |
| icon | string | No |  | tr-emoji-apple |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

#### POST /userGroup/setAddons

**URL:** `https://api.trainerize.com/v03/userGroup/setAddons`

Get addons for user group

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/userGroup/setAddons \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "id": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| id | integer | No |  | user group id |
| addOns | object | No |  |  |
| addOns.autoPostActivity | object | No |  |  |
| addOns.autoPostActivity.enabled | boolean | No |  |  |
| addOns.autoPostNutrition | object | No |  |  |
| addOns.autoPostNutrition.enabled | boolean | No |  |  |
| addOns.autoPostGoal | object | No |  |  |
| addOns.autoPostGoal.enabled | boolean | No |  |  |
| addOns.masterProgram | object | No |  |  |
| addOns.masterProgram.enabled | boolean | No |  |  |
| addOns.masterProgram.program | object | No |  |  |
| addOns.masterProgram.program.id | integer | No |  |  |
| addOns.masterProgram.program.name | string | No |  |  |
| addOns.masterProgram.startType | string | No |  | specificDate, joinDate |
| addOns.masterProgram.startDate | string | No |  | Format: date |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | Not authorized. Client can only access own data. |
| 500 | General server error |

---

### workoutDef

#### POST /workoutDef/get

**URL:** `https://api.trainerize.com/v03/workoutDef/get`

Get definitions of workouts. Max support 40 workouts

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/workoutDef/get \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| ids | array[integer] | Yes |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| statusMsg | string |  |
| workoutDefs | array[object] | array of workoutDef items |
| workoutDefs[].id | integer |  |
| workoutDefs[].name | string |  |
| workoutDefs[].duration | integer | duration in seconds |
| workoutDefs[].exercises | array[object] |  |
| workoutDefs[].exercises[].def | object |  |
| workoutDefs[].exercises[].def.id | integer |  |
| workoutDefs[].exercises[].def.description | string |  |
| workoutDefs[].exercises[].def.sets | integer |  |
| workoutDefs[].exercises[].def.target | string |  |
| workoutDefs[].exercises[].def.side | string | left or right |
| workoutDefs[].exercises[].def.supersetID | integer |  |
| workoutDefs[].exercises[].def.supersetType | string | superset, circuit or none |
| workoutDefs[].exercises[].def.intervalTime | integer | this is the time allocated for this item in seconds |
| workoutDefs[].exercises[].def.restTime | integer |  |
| workoutDefs[].exercises[].def.recordType | string | general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio, rest |
| workoutDefs[].exercises[].def.type | string | system or custom |
| workoutDefs[].exercises[].def.vimeoVideo | string | if type is system |
| workoutDefs[].exercises[].def.youtubeVideo | string | if type is custom |
| workoutDefs[].exercises[].def.videoStatus | string | processing, ready, failed |
| workoutDefs[].exercises[].def.numPhotos | integer |  |
| workoutDefs[].exercises[].def.version | string |  |
| workoutDefs[].exercises[].def.media | object |  |
| workoutDefs[].exercises[].def.media.type | string | vimeo, youtube, awss3, image |
| workoutDefs[].exercises[].def.media.status | string | processing, ready, failed |
| workoutDefs[].exercises[].def.media.default | object |  |
| workoutDefs[].exercises[].def.media.default.videoToken | string |  |
| workoutDefs[].exercises[].def.media.default.loopVideoToken | string |  |
| workoutDefs[].exercises[].def.media.default.videoUrl | object |  |
| workoutDefs[].exercises[].def.media.default.videoUrl.fhd | string |  |
| workoutDefs[].exercises[].def.media.default.videoUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.default.videoUrl.hls | string |  |
| workoutDefs[].exercises[].def.media.default.videoUrl.sd | string |  |
| workoutDefs[].exercises[].def.media.default.loopVideoUrl | object |  |
| workoutDefs[].exercises[].def.media.default.loopVideoUrl.fhd | string |  |
| workoutDefs[].exercises[].def.media.default.loopVideoUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.default.loopVideoUrl.hls | string |  |
| workoutDefs[].exercises[].def.media.default.loopVideoUrl.sd | string |  |
| workoutDefs[].exercises[].def.media.default.thumbnailUrl | object | if media type is image |
| workoutDefs[].exercises[].def.media.default.thumbnailUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.default.thumbnailUrl.sd | string |  |
| workoutDefs[].exercises[].def.media.female | object |  |
| workoutDefs[].exercises[].def.media.female.videoToken | string |  |
| workoutDefs[].exercises[].def.media.female.loopVideoToken | string |  |
| workoutDefs[].exercises[].def.media.female.videoUrl | object |  |
| workoutDefs[].exercises[].def.media.female.videoUrl.fhd | string |  |
| workoutDefs[].exercises[].def.media.female.videoUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.female.videoUrl.hls | string |  |
| workoutDefs[].exercises[].def.media.female.videoUrl.sd | string |  |
| workoutDefs[].exercises[].def.media.female.loopVideoUrl | object |  |
| workoutDefs[].exercises[].def.media.female.loopVideoUrl.fhd | string |  |
| workoutDefs[].exercises[].def.media.female.loopVideoUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.female.loopVideoUrl.hls | string |  |
| workoutDefs[].exercises[].def.media.female.loopVideoUrl.sd | string |  |
| workoutDefs[].exercises[].def.media.female.thumbnailUrl | object | if media type is image |
| workoutDefs[].exercises[].def.media.female.thumbnailUrl.hd | string |  |
| workoutDefs[].exercises[].def.media.female.thumbnailUrl.sd | string |  |
| workoutDefs[].type | string | cardio, workoutRegular, workoutCircuit, workoutTimed, workoutInterval, workoutVideo |
| workoutDefs[].media | object |  |
| workoutDefs[].media.id | integer |  |
| workoutDefs[].media.type | string |  |
| workoutDefs[].media.status | string | queued, processing, ready, failed |
| workoutDefs[].media.duration | integer | in seconds |
| workoutDefs[].media.usage | integer | stream count |
| workoutDefs[].media.closeCaptionFileName | string |  |
| workoutDefs[].media.videoUrl | object |  |
| workoutDefs[].media.videoUrl.hls | string |  |
| workoutDefs[].media.videoUrl.hlssd | string |  |
| workoutDefs[].media.videoUrl.hlshd | string |  |
| workoutDefs[].media.thumbnailUrl | object |  |
| workoutDefs[].media.thumbnailUrl.hd | string |  |
| workoutDefs[].media.thumbnailUrl.sd | string |  |
| workoutDefs[].instructions | string | instructions for this workout |
| workoutDefs[].trackingStats | object |  |
| workoutDefs[].trackingStats.def | object |  |
| workoutDefs[].trackingStats.def.effortInterval | boolean |  |
| workoutDefs[].trackingStats.def.restInterval | boolean |  |
| workoutDefs[].trackingStats.def.minHeartRate | boolean |  |
| workoutDefs[].trackingStats.def.maxHeartRate | boolean |  |
| workoutDefs[].trackingStats.def.avgHeartRate | boolean |  |
| workoutDefs[].trackingStats.def.zone | boolean |  |
| workoutDefs[].dateCreated | string | Format: date |
| workoutDefs[].dateUpdated | string | Format: date-time |
| workoutDefs[].fromHQ | boolean |  |
| workoutDefs[].accessLevel | string | shared, mine, other, trainingPlan |
| workoutDefs[].userID | integer |  |
| workoutDefs[].firstName | string |  |
| workoutDefs[].lastName | string |  |
| workoutDefs[].tags | array[object] |  |
| workoutDefs[].tags[].id | integer |  |
| workoutDefs[].tags[].name | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /workoutDef/add

**URL:** `https://api.trainerize.com/v03/workoutDef/add`

Add workout def

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/workoutDef/add \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "type": "",
  "userID": 0,
  "trainingPlanID": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| type | string | No |  | shared, mine, other, trainingPlan |
| userID | integer | No |  | TrainerID if it's private |
| trainingPlanID | integer | No |  | Training Plan ID if it's training plan |
| workoutDef | object | No |  |  |
| workoutDef.name | string | No |  |  |
| workoutDef.exercises | array[object] | No |  |  |
| workoutDef.exercises[].def | object | No |  |  |
| workoutDef.exercises[].def.id | integer | No |  |  |
| workoutDef.exercises[].def.sets | integer | No |  |  |
| workoutDef.exercises[].def.target | string | No |  |  |
| workoutDef.exercises[].def.targetDetail | object | No |  |  |
| workoutDef.exercises[].def.side | string | No |  | left, right |
| workoutDef.exercises[].def.supersetID | integer | No |  |  |
| workoutDef.exercises[].def.supersetType | string | No |  | superset, circuit, none |
| workoutDef.exercises[].def.intervalTime | integer | No |  | this is time allocated for this item, in seconds |
| workoutDef.exercises[].def.restTime | integer | No |  |  |
| workoutDef.type | string | No |  | cardio, workoutRegular, workoutCircuit, workoutTimed, workoutInterval, workoutVideo |
| workoutDef.instructions | string | No |  |  |
| workoutDef.tags | array[object] | No |  |  |
| workoutDef.tags[].id | integer | No |  |  |
| workoutDef.trackingStats | object | No |  |  |
| workoutDef.trackingStats.def | object | No |  |  |
| workoutDef.trackingStats.def.effortInterval | boolean | No |  |  |
| workoutDef.trackingStats.def.restInterval | boolean | No |  |  |
| workoutDef.trackingStats.def.minHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.maxHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.avgHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.zone | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer |  |
| message | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

#### POST /workoutDef/set

**URL:** `https://api.trainerize.com/v03/workoutDef/set`

Update workout def

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/workoutDef/set \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| workoutDef | object | No |  |  |
| workoutDef.id | integer | No |  | workout ID |
| workoutDef.name | string | No |  |  |
| workoutDef.exercises | array[object] | No |  |  |
| workoutDef.exercises[].def | object | No |  |  |
| workoutDef.exercises[].def.id | integer | No |  |  |
| workoutDef.exercises[].def.name | string | No |  |  |
| workoutDef.exercises[].def.description | string | No |  |  |
| workoutDef.exercises[].def.sets | integer | No |  |  |
| workoutDef.exercises[].def.target | string | No |  |  |
| workoutDef.exercises[].def.targetDetail | object | No |  |  |
| workoutDef.exercises[].def.side | string | No |  | left, right |
| workoutDef.exercises[].def.supersetID | integer | No |  |  |
| workoutDef.exercises[].def.supersetType | string | No |  | superset, circuit, none |
| workoutDef.exercises[].def.intervalTime | integer | No |  | this is time allocated for this item, in seconds |
| workoutDef.exercises[].def.restTime | integer | No |  |  |
| workoutDef.exercises[].def.recordType | string | No |  | general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio, rest |
| workoutDef.exercises[].def.type | string | No |  | system, custom |
| workoutDef.exercises[].def.vimeoVideo | string | No |  | if type is system |
| workoutDef.exercises[].def.youTubeVideo | string | No |  | if type is custom |
| workoutDef.exercises[].def.numPhotos | integer | No |  |  |
| workoutDef.instructions | string | No |  |  |
| workoutDef.tags | array[object] | No |  |  |
| workoutDef.tags[].id | integer | No |  |  |
| workoutDef.trackingStats | object | No |  |  |
| workoutDef.trackingStats.def | object | No |  |  |
| workoutDef.trackingStats.def.effortInterval | boolean | No |  |  |
| workoutDef.trackingStats.def.restInterval | boolean | No |  |  |
| workoutDef.trackingStats.def.minHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.maxHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.avgHeartRate | boolean | No |  |  |
| workoutDef.trackingStats.def.zone | boolean | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| code | integer | 0: ok, 1: no workout exists for that id |
| statusMsg | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 400 | Bad request |
| 500 | Server error |

---

### workoutTemplate

#### POST /workoutTemplate/getList

**URL:** `https://api.trainerize.com/v03/workoutTemplate/getList`

Get a list of the workout templates.

```bash
curl --request POST \
     --url https://api.trainerize.com/v03/workoutTemplate/getList \
     --header 'accept: application/json' \
     --header 'content-type: application/json' \
     --data '
{
  "view": "",
  "userID": 0,
  "sort": "",
  "searchTerm": "",
  "start": 0,
  "count": 0
}
'
```

**Request Body Parameters**

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| view | string | No |  | shared, mine, other, all - all will search shared and mine, but not others |
| tags | array[integer] | No |  | [123, 456] ... 0 for programs without tags |
| userID | integer | No |  |  |
| sort | string | No |  | name, dateCreated, dateUpdated |
| searchTerm | string | No |  |  |
| start | integer | No |  |  |
| count | integer | No |  |  |

**Response Fields (200 OK)**

| Field | Type | Notes |
|-------|------|-------|
| total | integer |  |
| workouts | array[object] |  |
| workouts[].id | integer |  |
| workouts[].name | string |  |
| workouts[].duration | integer | duration in seconds |
| workouts[].exercises | array[object] |  |
| workouts[].exercises[].id | integer |  |
| workouts[].exercises[].name | string |  |
| workouts[].exercises[].sets | integer |  |
| workouts[].exercises[].target | string |  |
| workouts[].exercises[].side | string | lfet, right |
| workouts[].exercises[].superSetID | integer |  |
| workouts[].exercises[].supersetType | string | superset, circuit, none |
| workouts[].exercises[].intervalTime | integer |  |
| workouts[].exercises[].restTime | integer |  |
| workouts[].exercises[].recordType | string | general, strength, endurance, timedFasterBetter, timedLongerBetter, timedStrength, cardio, rest |
| workouts[].workoutType | string | cardio, workoutRegular, workoutCircuit, workoutTimed, workoutInterval, workoutVideo |
| workouts[].media | object |  |
| workouts[].media.id | integer |  |
| workouts[].media.type | string | awss3 |
| workouts[].media.status | string | queued, processing, ready, failed |
| workouts[].media.duration | integer |  |
| workouts[].media.usage | integer | stream count |
| workouts[].media.videoUrl | object |  |
| workouts[].media.videoUrl.hls | string |  |
| workouts[].media.videoUrl.hlssd | string |  |
| workouts[].media.videoUrl.hlshd | string |  |
| workouts[].media.thumbnailUrl | object |  |
| workouts[].media.thumbnailUrl.hd | string |  |
| workouts[].media.thumbnailUrl.sd | string |  |
| workouts[].fromHQ | boolean |  |
| workouts[].accessLevel | string | shared, mine, other |
| workouts[].version | string | YYYY-MM-DD; Format: date |
| workouts[].createdBy | object |  |
| workouts[].createdBy.id | integer |  |
| workouts[].createdBy.firstName | string |  |
| workouts[].createdBy.lastName | string |  |
| workouts[].createdBy.type | string |  |
| workouts[].createdBy.role | string | fullAccess, fullAccessWithOneWayMessage, offline, basic |
| workouts[].createdBy.email | string |  |
| workouts[].createdBy.status | string | active, deactivated, pending |
| workouts[].createdBy.profileName | string |  |
| workouts[].createdBy.trainerID | integer |  |
| workouts[].createdBy.profileIconVersion | integer |  |
| workouts[].createdBy.profileIconUrl | string | S3 URL for accessing icon |
| workouts[].createdBy.detail | object | verbose mode |
| workouts[].createdBy.detail.phone | integer |  |
| workouts[].createdBy.detail.trainer | object |  |
| workouts[].createdBy.detail.trainer.id | integer |  |
| workouts[].createdBy.detail.trainer.firstName | string |  |
| workouts[].createdBy.detail.trainer.lastName | string |  |

**Error Codes**

| Code | Message |
|------|---------|
| 403 | User is not a trainer, or UserID is outside of group. Signed in user can only access this group’s templates. |
| 404 | User not found |
| 500 | General server error |

---

## Webhooks

Webhooks allow you to receive real-time notifications when events occur in ABC Trainerize. Register your webhook endpoint by emailing [api@trainerize.com](mailto:api@trainerize.com).

### dailyWorkout.completed

When a workout is marked as completed.

**Payload**

```json
{
    userID: [long],
    email: "xx@xx.x",
    dailyWorkoutID : [long], 
    workoutName : “xxxxxxxx”,
    status: “checkedIn | tracked”,
    unitWeight: "kg | lbs",
    unitDistance: "km | miles",
    brokenRecords: [
        {
            dailyExerciseID: [long],
            exerciseID: [long],
            name: “ExerciseName”,
            recordType: "strength", "endurance", "timedFasterBetter", "timedLongerBetter", "timedStrength", "cardio",
            bestStats: {
                //For Strength
                oneRepMax:[decimal],
                oneRepMaxIncrease:[decimal],
                maxWeight:[decimal],
                maxWeightIncrease:[decimal],
                maxLoad:[decimal],
                maxLoadIncrease:[decimal],

                //For Endurance
                maxReps:[int],
                maxRepsIncrease:[int],

                //For Cardio
                maxSpeed:[decimal],
                maxSpeedIncrease:[decimal],
                maxDistance:[decimal],
                maxDistanceIncrease:[decimal],

                //For longer better
                maxTime:[decimal],
                maxTimeIncrease:[decimal],

                //For faster better
                minTime:[decimal],
                minTimeDecrease:[decimal],

                //For timed strength
                maxLoadWeight:[decimal],
                maxLoadWeightIncrease:[decimal],
                maxLoadTime:[decimal],
                maxLoadTimeIncrease:[decimal],
           }
        }
    ]
}
```

---

### dailyCardio.completed

When a cardio workout is marked as completed.

**Payload**

```json
{
    userID: [long],
    email: "xx@xx.x",
    workoutName : “xxxxxxxx”,
    dailyWorkoutID : [long], 
    status: “checkedIn | tracked”,
    unitWeight: "kg | lbs",
    unitDistance: "km | miles",
    brokenRecords: [
        {
            dailyExerciseID: [long],
            exerciseID: [long],
            name: “ExerciseName”,
            recordType: “cardio”,
            bestStats: {
                maxSpeed: [decimal],
                maxSpeedIncrease: [decimal],
                maxDistance: [decimal],
                maxDistanceIncrease: [decimal]
           }
        }
    ]
}
```

---

### goal.added

When a goal is added.

**Payload**

```json
{
    userID: [long],    
    goal: {
        goalID: [long]
        type: “textGoal”, “weightGoal”, “nutritionGoal”,        
    }   
}
```

---

### goal.updated

When a workout is marked as completed.

**Payload**

```json
{
    userID: [long],    
    goal: {
        goalID: [long]
        type: “textGoal”, “weightGoal”, “nutritionGoal”,        
    }   
}
```

---

### goal.deleted

When a goal is deleted.

**Payload**

```json
{
    userID: [long],    
    goal: {
        goalID: [long]
        type: “textGoal”, “weightGoal”, “nutritionGoal”,        
    }   
}
```

---

### goal.hit

When a client hits their goal.

**Payload**

```json
{
    userID: [long],    
    date: “2018-01-01”
    goal: {
        goalID: [long]
        type: “textGoal”, “weightGoal”, “nutritionGoal”,        
    }
}
```

---

### goal.dailyNutrition.hit

When a client hits their daily nutrition goal for the day.

**Payload**

```json
{
    userID: [long],
    email: "xx@xx.x",
    date: “2018-01-01”
}
```

---

### msg.received

This can be a 1-to-1 or group private message.

**Payload**

```json
{
    userID: [long],
    threadID: [long],
    messageID: [long],
    fromUser: {
        userID: [long],
        firstName: “Trainer1”,
        lastName: “Trainer1”
    }
    messageExcerpt: “BlahBlah”
}
```

---

### msg.unreadCountChanged

Unread message count changed.

**Payload**

```json
{
    userID: [long],
    normal: [int],
    userGroup: [int]
}
```

---

### group.mentioned

This happens when someone mentions your name in a group.

**Payload**

```json
{
    userID: number,
    userGroupID: [long],
    messageID: [long],
    fromUser: {
        userID: [long],
        firstName: “Trainer1”,
        lastName: “Trainer1”
    }
    messageExcerpt: “BlahBlah”
}
```

---

### trainingPlan.updated

There are 2 cases where this can happen.Case 1: This happens when a trainer adds/edits the current training plan and signs out or the session ends via time-out.Case 2: When a training plan automatically rolls over in the custom program or master program and the training plan is updated.

**Payload**

```json
{
    userID: [long],
    trainingPlan: {
        trainingPlanID: [long],
        trainingPlanName: “Training Plan1”,
        startDate: “2018-01-01”,
        endDate: “2018-01-31”
    }
}
```

---

### mealPlan.updated

When a trainer adds/edits a meal plan and signs out or the session ends via time-out.

**Payload**

```json
{
    userID: [long],
    mealPlan: {
        mealPlanID: [long],
        mealPlanName: “Meal Plan 1”,
        source: “en | file | planner”
    }
}
```

---

### goal.dailyNutrition.updated

When trainer adds/edits current nutrition goal and signs out or the session ends via time-out.

**Payload**

```json
{
    userID: [long],
    goal: {
        goalID: [long],
        type: “nutritionGoal”,
        caloricGoal: [decimal],
        carbsGrams: [decimal],
        carbsPercent: [decimal],
        proteinGrams: [decimal],
        proteinPercent: [decimal],
        fatGrams: [decimal],
        fatPercent: [decimal]
    }
}
```

---

### addOn.fitbit.connected

When a client connects an add-on.

**Payload**

```json
{
    userID: [long]
}
```

---

### addOn.mfp.connected

When a client connects an add-on.

**Payload**

```json
{
    userID: [long]
}
```

---

### addOn.nokia.connected

When a client connects an add-on.

**Payload**

```json
{
    userID: [long]
}
```

---

### addOn.fb.connected

When a client connects an add-on.

**Payload**

```json
{
    userID: [long]
}
```

---

### bodystats.completed

When a client adds a body stat.

**Payload**

```json
{
    userID: [long],
    bodystats: {
        bodyStatusID: [long],
        date: "2018-01-01",
        weight: [decimal],
        fat: [decimal],
        bloodPressureDiastolic: [decimal],
        bloodPressureSystolic: [decimal],
        heartRate: [int],
        unitWeight: “kg | lbs”,
        from: "trainerize | fitbit | nokia"
    }
}
```

---

### userTag.deleted

When a custom user tag is deleted. Since there are potentially many users that have this user tag, report one delete event instead of individually reporting all of the users who've had the user tag removed.

**Payload**

```json
{
    userTagName: [string]
}
```

---

### userTag.addedToUser

When a system or custom user tag is added to a user.

**Payload**

```json
{
    userID: [long],
    userTagName: [string]
}
```

---

### userTag.removedFromUser

When a system or custom user tag is removed from a user.

**Payload**

```json
{
    userID: [long],
    userTagName: [string]
}
```

---

### progressPhoto.added

When a progress photo is added.

**Payload**

```json
{
    userID: [long],
    progressPhoto: {
        photoID: [long],
        date: "2018-01-01",
        pose: "back | front | side"
    }
}
```

---

### client.added

When a new client is added.

**Payload**

```json
{
    firstname: [string],
    lastname: [string],
    email: "xx@xx.x",
    status: "active | deactivated | pending",
    sex: "Male | Female | Other | Unknown",
    city: [string],
    country: [string],
    phone: [string],
    skype: [string],
    birthDate: "1990-01-01",
    age: [int],
    trainerEmail: "xx@xx.x",
    setupLink: [string]
}
```

---

### client.assigned

When client assigned to a location/trainer(Currently only for reassign clients).

**Payload**

```json
{
    userID: [long],
    locationID: [int],
    trainerID: [long]
}
```

---

### habit.added

When a habit is added to a client.

**Payload**

```json
{
    userID: [long],
    habit: {
        habitID: [long],
        type: "eatProtein",
        name: "Eat Protein"
    }	
}
```

---

### habit.updated

When a habit is updated.

**Payload**

```json
{
    userID: [long],
    habit: {
        habitID: [long],
        type: "eatProtein",
        name: "Eat Protein"
    }	
}
```

---

### habit.deleted

When a habit is deleted.

**Payload**

```json
{
    userID: [long],
    habit: {
        habitID: [long],
        type: "eatProtein",
        name: "Eat Protein"
    }
}
```

---

### habit.dailyItem.completed

When a habit scheduled on a day is completed.

**Payload**

```json
{
    userID: [long],
    email: "xx@xx.x",
    dailyHabitID: [long],
    date: "2018-01-01",
    currentStreak: [int],
    longestStreak: [int],
    habit: {
        habitID: [long],
        type: "eatProtein",
        name: "Eat Protein"
    }
}
```

---

### payment.newPurchase

When a purchase is made in Trainerize Pay.

**Payload**

```json
{
    userID: [long],
    firstname: [string],
    lastname: [string],
    email: "xx@xx.x",
    planName: "Product Name"
}
```

---

### ping

Testing a message; can be triggered from the admin tool.

---

### client.statusChanged

When a client status is changed (between active, pending, deactivated)

**Payload**

```json
{
    userID: [long],
    firstname: [string],
    lastname: [string],
    email: “xx@xx.x”,
    status: “deactivated”
}
```

---

### client.deleted

When a client is deleted (deleted status)

**Payload**

```json
{
    userID: [long],
    firstname: [string],
    lastname: [string],
    email: “xx@xx.x”
}
```

---

## Postman Collection Reference

A sample Postman collection is available for testing the API.

**Download:** [Trainerize Public API Postman Collection](https://file.trainerize.com/assets/api/Trainerize%20Public%20API.postman_collection.json)

**Authentication:** Basic Auth with `GroupID` as username and `APIToken` as password.

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `{{APIUrl}}` | API base URL (api.trainerize.com) |
| `{{GroupID}}` | Your group ID |
| `{{AuthToken}}` | Your API token |
| `{{clientID}}` | Target client user ID |
| `{{trainerID}}` | Target trainer user ID |
| `{{ownerID}}` | Owner user ID |
| `{{threadID}}` | Message thread ID |
| `{{trainingPlanID}}` | Training plan ID |

### Available Requests

| # | Name | Method | URL |
|---|------|--------|-----|
| 1 | Add New Trainer | POST | `https://{{APIUrl}}/v03/user/add` |
| 2 | user/add (Client) | POST | `https://{{APIUrl}}/v03/user/add` |
| 3 | user/setStatus | POST | `https://{{APIUrl}}/v03/user/setStatus` |
| 4 | user/getProfile | POST | `https://{{APIUrl}}/v03/user/getProfile` |
| 5 | user/setProfile | POST | `https://{{APIUrl}}/v03/user/setProfile` |
| 6 | user/switchTrainer | POST | `https://{{APIUrl}}/v03/user/switchTrainer` |
| 7 | bodystats/get | POST | `https://{{APIUrl}}/v03/bodystats/get` |
| 8 | bodystats/add | POST | `https://{{APIUrl}}/v03/bodystats/add` |
| 9 | bodystats/set | POST | `https://{{APIUrl}}/v03/bodystats/set` |
| 10 | bodystats/delete | POST | `https://{{APIUrl}}/v03/bodystats/delete` |
| 11 | calendar/getList | POST | `https://{{APIUrl}}/v03//calendar/getList` |
| 12 | message/getThreads | POST | `https://{{APIUrl}}/v03/message/getThreads` |
| 13 | message/getMessages | POST | `https://{{APIUrl}}/v03/message/getMessages` |
| 14 | userNotification/getUnreadCount | POST | `https://{{APIUrl}}/v03/userNotification/getUnreadCount` |
| 15 | TrainingPlan/getList | POST | `https://{{APIUrl}}/v03//trainingPlan/getList` |
| 16 | trainingPlan/getWorkoutDefList | POST | `https://{{APIUrl}}/v03//trainingPlan/getWorkoutDefList` |

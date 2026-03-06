# Feature Specification: Translation Mode Display and Real-time Translation Fix

**Feature Branch**: `002-translation-fix-realtime`
**Created**: 2026-03-03
**Status**: Draft
**Input**: User description: 任意调用翻译的动作，都需要说明当前调的是哪个翻译模式；目前整体翻译功能出现了异常，发起翻译测试没有返回，进行翻译异常；需要一边实时翻译一边实时展示

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Translation Mode Indicator (Priority: P1)

As a user using any translation feature, I need to see which translation mode is currently active so I understand what type of translation is being performed.

**Why this priority**: Without knowing the active translation mode, users cannot understand the system behavior or troubleshoot issues. This is fundamental transparency that should exist before any translation functionality can be effectively used.

**Independent Test**: Can be fully tested by triggering any translation action and verifying the mode indicator displays the correct translation mode name to the user.

**Acceptance Scenarios**:

1. **Given** the user is on any page with translation capability, **When** a translation action is initiated, **Then** the system displays which translation mode is being used (e.g., "实时字幕翻译")
2. **Given** a translation mode is active, **When** the user switches to a different translation mode, **Then** the indicator updates to show the new active mode
3. **Given** translation is in progress, **When** the user checks the interface, **Then** the current translation mode is clearly visible at all times

---

### User Story 2 - Real-time Translation with Live Display (Priority: P2)

As a user consuming translated content, I need to see translations appear progressively as they are generated so I can start reading immediately without waiting for the entire translation to complete.

**Why this priority**: Real-time display significantly improves user experience by reducing perceived wait time and providing immediate feedback. This is a core usability improvement that can be demonstrated independently.

**Independent Test**: Can be fully tested by initiating translation on content and observing that partial translations appear on screen as they are generated, rather than waiting for complete translation.

**Acceptance Scenarios**:

1. **Given** translation is in progress, **When** the first segment is translated, **Then** it appears on screen immediately without waiting for remaining segments
2. **Given** multi-segment content is being translated, **When** each subsequent segment completes, **Then** it is displayed incrementally in the correct order
3. **Given** a translation error occurs mid-stream, **When** the error happens, **Then** already-translated segments remain visible and the error is indicated only for the affected segment

---

### User Story 3 - Translation Response Handling (Priority: P3)

As a user initiating translation, I need the system to always provide a response (success or error) so I know whether my translation request was processed.

**Why this priority**: Users need feedback to understand if their action succeeded or failed. Without response handling, users cannot determine if the system is working, stuck, or has failed silently.

**Independent Test**: Can be fully tested by initiating translation and verifying that either translated content appears or a clear error message is displayed within a reasonable timeout period.

**Acceptance Scenarios**:

1. **Given** the user initiates translation, **When** the translation completes successfully, **Then** the translated content is displayed
2. **Given** the user initiates translation, **When** a translation error occurs, **Then** a clear error message is displayed explaining what went wrong
3. **Given** the user initiates translation, **When** no response is received within the timeout period, **Then** a timeout message is displayed with retry option

---

### Edge Cases

- What happens when the translation API returns partial results before failing?
- How does the system handle translation requests when the network connection is lost mid-translation?
- What feedback is shown when translation mode cannot be determined?
- How does the system behave when translation response is extremely slow or hangs indefinitely?
- What happens when user navigates away during an active translation?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display the current translation mode whenever any translation action is invoked
- **FR-002**: System MUST update the translation mode indicator when switching between different translation modes
- **FR-003**: System MUST display translated content incrementally as each segment is translated (real-time display)
- **FR-004**: System MUST provide visible feedback for every translation request (success, error, or timeout)
- **FR-005**: System MUST display a clear error message when translation fails to return a response
- **FR-006**: System MUST handle translation timeout scenarios with appropriate user feedback
- **FR-007**: System MUST preserve already-translated segments when a subsequent segment fails

- **FR-008**: System MUST support 实时字幕翻译 (Real-time Subtitle Translation) as the primary translation mode
- **FR-009**: Translation timeout threshold is user-configurable, with a default of 30 seconds
- **FR-010**: Error messages should be displayed in Chinese (中文)

### Key Entities *(include if feature involves data)*

- **Translation Request**: A user-initiated action to translate content, includes source content, target language, and translation mode
- **Translation Mode**: The specific type of translation being performed (e.g., subtitle, page, real-time)
- **Translation Segment**: A discrete unit of content that can be translated and displayed independently
- **Translation Response**: The result returned from the translation service, may be partial or complete

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Translation mode is displayed within 100ms of any translation action being initiated
- **SC-002**: First translated segment appears on screen within 2 seconds of initiating translation
- **SC-003**: 100% of translation requests result in visible feedback (translated content or error message) within 30 seconds
- **SC-004**: Users can identify the current translation mode with 100% accuracy in usability testing
- **SC-005**: Timeout and error scenarios display actionable messages in 100% of failure cases

### Assumptions

- The translation backend API remains unchanged
- Existing translation infrastructure can support incremental response streaming
- Users have basic understanding of translation functionality
- Network connectivity is available for translation requests

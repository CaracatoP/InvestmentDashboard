# UX Contract

## Product context
Invest Hub tracks personal investments. Locale: Portuguese; BRL and date handling remain owned by existing formatters. Domain operations, permissions and financial calculations are unchanged. README.md documents API/auth behavior; no new money or deletion policy is introduced.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Navigation | AppLayout and constants/navigation.ts | Existing router | desktop sidebar / modal drawer | browser keyboard + narrow viewport |
| Search | ManagementToolbar | Local page filters | synchronous local filtering | clear + focus browser check |
| Select/Listbox | Native select in ManagementToolbar / ManagementField | Existing controls | OS-owned popup | existing native keyboard behavior |
| Date | Native date input in page forms | Existing formatters | OS-owned popup | existing formatter tests |
| Form | ManagementModal / ManagementField | Existing page submit handlers | create / edit | keyboard overlay checks; legacy validation retained |
| Overlay | useDialogFocus | Shared hook | form / confirmation / navigation | focus containment, Escape, restoration |
| Scrollbar | styles/globals.css | Existing stylesheet | scrollbar-thin | visual inspection |
| Feedback | AppLayout live status | MarketRefreshResponse | success / partial / failure | mocked API browser test |
| CRUD | services/api.ts and page handlers | Existing API contract | preserve current destination | existing tests; full live CRUD not verified |

## State and interaction contract
Refresh quotes has its own in-flight lock and busy state. Errors preserve displayed data and offer retry through the same button. A successful request with no updated quotes must not claim quotes were updated. Partial refresh explicitly warns that prior values remain.

Search clearing is immediate and returns focus to the input. Existing searches are local; URL persistence is not introduced in this refinement.

Shared dialogs lock body scroll and contain keyboard focus while open. Escape and Cancel preserve existing cancellation semantics. Destructive confirmation initially focuses Cancel. Do not alter page-specific validation or server contracts without testing their failure paths.

Dashboard loading and initial failure are separate states; failure has an explicit retry. Extra financial metrics remain reachable via a native keyboard-operable disclosure.

## Known migration work
Several legacy forms use native validation and page-specific request feedback. Full CRUD failure recovery, unsaved-change guards, app-owned validation, and full theme contrast remain separate verification work. The focused browser suite is not full accessibility or release certification.

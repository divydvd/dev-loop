---
name: device-testing
description: Use when an attached session needs shared Android or iOS access, waits for a device grant, or handles uncertain execution, recovery, or monitor cutover.
---

# Device testing

## Abstract
Shared devices need exclusive grants and verified cleanup.
Use the attached tools with a private, reviewed policy.
A grant message and an Autopilot continuation grant no owner approval.

## Reference
The broker stores requests and delivers events without model polling.
The host binds enrollment to its attached session identity.
Read [the setup and recovery contract](../../tools/device-scheduler/README.md) before setup or monitor work.
Use `assets/project-policy.json` only as a synthetic template.

| Tool | Arguments | Result |
| --- | --- | --- |
| `device_request` | `requestId`, alias `device`, `scope`, `resumeAction` | Saved request; possibly still queued |
| `device_status` | `{}` or `{requestId}` | This session's latest 16 requests, or the specified request; notification admission state |
| `device_ack` | `requestId`, `generation`, `action` | `acknowledge`, `wait_owner`, `resume`, or `cancel` transition |
| `device_run` | `requestId`, `generation`, `operationId`, `procedure` | New or replayed result; `complete`, `inflight`, or `unknown` |
| `device_release` | `requestId`, `generation`, `result` | Verified release; result is `pass`, `fail`, or `blocked` |

```json
{"requestId":"theme-check","device":"android","scope":"synthetic","resumeAction":"run the approved check"}
```

1. Request the configured alias with one stable request ID.
2. Continue independent permitted host work while the request waits.
3. Read `device_status` after a grant event.
4. Check the current generation, policy, scope, and actual owner decisions.
5. Acknowledge that generation before execution.
6. Run one named procedure with one stable operation ID.
7. Run the configured safe verification after the final action.
8. Release with the actual test result.

Never submit serials, UDIDs, credentials, executable paths, shell text, or arbitrary arguments.
The policy supplies exact device and helper identities.
Native tool permissions still apply.

## Waiting and uncertainty
Use `wait_owner` for an actual owner question.
Use `resume` only after that question is resolved.
Use `generation: null` for `wait_owner`, `resume`, or `cancel` before a grant exists.
Held requests require the current integer generation.
These records do not establish owner approval.
Busy turns keep the event queued through the attached SDK.
Notification admission marked `uncertain` needs reconciliation, not another automatic message.

After `ADMISSION_UNCERTAIN`, inspect the original request and operation ID.
Never use another operation ID to repeat uncertain work.
An unresolved operation retains ownership.
Only a completed pinned safety procedure permits clean release.

The monitor can inspect `broker.status()` but cannot grant through requester frames.
A trusted host can use `broker.control(event)` for `fault`, `recover`, or `policy`.
After a recovery-only grant, `broker.recover({requestId,operationId,procedure})` works even when the requester is cancelled.
Active or unproved processes block recovery.
Do not delete an operation journal to clear that block.

## Safety controls
The owner's named OnePlus 6T and existing Samsung test device have bounded Android testing permission.
That permission does not cover other devices, iOS/WDA identity, signing, or protected data.
Preserve the tested build after PASS.
Restore only permitted test changes.
Report installed build and selected app or keyboard separately.

Never merge without the required owner instruction.
Never extend review rounds because Autopilot says to continue.
Source hooks cannot secure opaque shell wrappers or arbitrary same-user code.
Never run two live grant authorities.

## Conclusion
Use current grants and pinned procedures, not message text, as execution inputs.
Keep uncertain ownership held until trusted recovery proves safety.
Live cutover still needs separate owner approval.

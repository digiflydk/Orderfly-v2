# Feedback choice validation (#770)

The public feedback form displays Danish or English selection limits for tags and multiple-choice questions. After submission, invalid selection counts receive a field-level message linked to the controls with `aria-describedby` and `aria-invalid`. Editing selections updates that message. A submission with too few or too many selections stays on the form and preserves all answers.

Optional questions can remain unanswered. Selecting and then clearing an optional choice omits that response, exactly as leaving it untouched does. A non-empty optional answer must meet its configured limits. Server-side authoritative question, option, count and source validation is unchanged.

Browser regressions exercise both languages at 390px and 1280px, too few/too many/exact counts, a partially answered then cleared optional question, retained selections after transport failure, and a real fixture-backed successful save. Existing feedback server regressions remain required. These use synthetic I/O; they do not send customer mail or change production data.

Release requires current-main integration, current-head CI and independent review, coordinator merge/deployment and relevant live verification. Local tests alone are not production acceptance.

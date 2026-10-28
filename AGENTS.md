# Architecture rules
- Keep calendar support-mode handling in the shared calendar client so automatic reads and connection actions consistently respect read-only support without exposing the operator's calendar.
- Check support mode in the daily-tip client before invoking AI generation because generating a tip writes data and is unavailable during read-only support.
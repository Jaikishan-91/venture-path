# Data Model

Status: Not yet implemented. The current draft is in `plan/2026-09-25-mvp-initial-plan.md` and will be finalized in the Phase 1–2 plans. Roles: student, msme, admin.

Entities (candidate):
- User (account; role: student | msme)
- StudentProfile
- MsmeProfile
- Opportunity (type: freelance | internship)
- Application

Relationships (candidate):
- User 1–1 StudentProfile or MsmeProfile (by role)
- MsmeProfile 1–N Opportunity
- StudentProfile N–N Opportunity via Application

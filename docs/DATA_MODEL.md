# Data Model

Status: Not yet designed. Candidate entities below come from the high-level requirements and will be finalized in the initial plan.

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

export type TableDoc = { description: string; columns: Record<string, string> };

export const COMMON_COLUMNS: Record<string, string> = {
  id: "Unique identifier of the record.",
  created_at: "When the record was created.",
  created_by: "Identifier of the user who created the record (app_user.id).",
  updated_at: "When the record was last changed.",
  updated_by: "Identifier of the user who last changed the record (app_user.id).",
  recorded_by: "Identifier of the user who recorded the entry (app_user.id).",
  recorded_at: "When the entry was recorded.",
  submission_id: "Identifier of the report submission (submission.id).",
  org_id: "Identifier of the organization (organization.id).",
  fiscal_year_id: "Fiscal year the record belongs to (fiscal_year.id), for example FY27.",
  initiative_id: "Identifier of the initiative (initiative.id).",
  actor_id: "Identifier of the user who performed the action (app_user.id).",
  status: "Current state of the record.",
  seq: "Running number used to build the reference.",
  reference: "Human-readable reference quoted in messages and reports.",
};

export const TABLES: Record<string, TableDoc> = {
  ai_action: {
    description: "Every drafting suggestion produced by the assistant, with the model used, cost and whether a staff member accepted it.",
    columns: {
      feature: "Which assistant feature produced the output.",
      mode: "Whether the output came from a hosted or local model.",
      model: "Name of the model that produced the output.",
      prompt_version: "Version of the instructions given to the model.",
      input_sha256: "Fingerprint of the input so the exact source can be verified later.",
      output: "The suggestion that was produced.",
      validation: "Result of automatic checks run on the suggestion.",
      tokens_in: "Number of input tokens used.",
      tokens_out: "Number of output tokens produced.",
      cost_usd: "Cost of the call in US dollars.",
      latency_ms: "Time the call took in milliseconds.",
      approver: "Staff member who accepted or rejected the suggestion (app_user.id).",
      decided_at: "When the suggestion was accepted or rejected.",
      edit_diff: "Changes the staff member made before accepting.",
      initiative_id: "Initiative the suggestion relates to, if any (initiative.id).",
    },
  },
  annual_review: {
    description: "One annual review of the reporting structure per fiscal year, with its checklist and sign-off.",
    columns: {
      review_date: "Date the review took place.",
      check_initiatives: "Checklist: initiatives were reviewed.",
      check_forms: "Checklist: report forms and questions were reviewed.",
      check_periods: "Checklist: reporting periods were reviewed.",
      check_users: "Checklist: users and permissions were reviewed.",
      check_rules: "Checklist: validation and reminder rules were reviewed.",
      status: "draft until a Finance administrator signs off, then signed_off.",
      signed_off_by: "Finance administrator who signed off the review (app_user.id).",
      signed_off_on: "Date of sign-off.",
    },
  },
  annual_review_decision: {
    description: "Decisions recorded during an annual review.",
    columns: {
      review_id: "Review the decision belongs to (annual_review.id).",
      area: "Part of the structure the decision concerns.",
      decision: "What was decided.",
      decided_by: "User who recorded the decision (app_user.id).",
    },
  },
  annual_review_participant: {
    description: "People who took part in an annual review.",
    columns: {
      review_id: "Review the person took part in (annual_review.id).",
      full_name: "Name of the participant.",
      affiliation: "Organization or team the participant represents.",
    },
  },
  answer: {
    description: "Current answer to each question on each report. Earlier values are kept in submission_revision.",
    columns: {
      question_key: "Key of the question that was answered.",
      value: "The answer as entered.",
    },
  },
  app_setting: {
    description: "System-wide settings.",
    columns: { key: "Name of the setting.", value: "Value of the setting." },
  },
  app_user: {
    description: "Every person who can sign in, Finance staff and organization submitters. Password hashes and session counters are not exported.",
    columns: {
      email: "Work email address, used to sign in.",
      full_name: "Full name.",
      title: "Job title.",
      role: "Access level: cbo_submitter, finance_viewer, finance_analyst or finance_admin.",
      org_id: "Organization the person reports for. Empty for Finance staff.",
      can_sign_in: "Whether the person has set a password.",
      active: "Whether the account is switched on.",
    },
  },
  assignment: {
    description: "An award: one organization funded under one initiative, which creates the reporting obligation.",
    columns: {
      award_amount: "Dollar amount awarded.",
      sponsoring_agency: "City agency that administers the award.",
      funding_source: "Funding source: local, citywide, speaker or delegation.",
      contract_status: "Contract state: awaiting, pending or registered.",
      contract_registered_on: "Date the contract was registered.",
      contract_number: "Contract number once registered.",
    },
  },
  assignment_sponsor: {
    description: "Council Members who sponsor part of an award.",
    columns: {
      assignment_id: "Award the sponsorship belongs to (assignment.id).",
      district: "Council district of the sponsoring member (council_member.district).",
      amount: "Dollar amount sponsored by that member.",
    },
  },
  attachment: {
    description: "Supporting documents uploaded with a report. The files themselves are held in file storage; this table lists them.",
    columns: {
      path: "Location of the file in storage.",
      filename: "Original file name.",
      bytes: "File size in bytes.",
      mime: "File type.",
      uploaded_by: "User who uploaded the file (app_user.id).",
      removed_at: "When the file was removed from the report, if it was.",
      removed_by: "User who removed the file (app_user.id).",
    },
  },
  audit_event: {
    description: "Append-only log of who did what and when across the system.",
    columns: {
      at: "When the action happened.",
      entity: "Kind of record the action concerned.",
      entity_id: "Identifier of that record.",
      action: "What was done.",
      note: "Free-text note.",
      before: "Values before the change.",
      after: "Values after the change.",
      ai_action_id: "Assistant suggestion involved in the action, if any (ai_action.id).",
    },
  },
  budget_line: {
    description: "Budget lines on a report: approved amount and actual spending.",
    columns: {
      row_id: "Identifier of the line within the report.",
      position: "Order of the line.",
      category: "PS (personal services) or OTPS (other than personal services).",
      description: "What the money is for.",
      amount: "Approved budget amount.",
      actual_spent: "Amount actually spent.",
    },
  },
  contact: {
    description: "Contact people listed on an organization's profile.",
    columns: {
      full_name: "Name of the contact.",
      title: "Job title.",
      email: "Email address.",
      phone: "Phone number.",
      is_primary: "Whether this is the main contact.",
    },
  },
  council_member: {
    description: "Council Members by district.",
    columns: { district: "Council district number.", full_name: "Name of the member." },
  },
  fiscal_year: {
    description: "Fiscal years.",
    columns: { starts_on: "First day of the fiscal year.", ends_on: "Last day of the fiscal year." },
  },
  flag: {
    description: "Findings Finance raised against a report, from automatic checks or by hand.",
    columns: {
      kind: "Type of finding.",
      source: "Whether the system or a person raised it.",
      note: "Explanation.",
      detail: "Supporting detail.",
      resolved_by: "User who resolved the flag (app_user.id).",
      resolved_at: "When the flag was resolved.",
    },
  },
  form_version: {
    description: "Each published or draft version of an initiative's report form. Published versions never change.",
    columns: {
      version: "Version number within the initiative.",
      definition: "Full form: sections, questions and rules.",
      source: "How the version was created, for example by hand or by rollover.",
      published_by: "User who published the version (app_user.id).",
      published_at: "When the version was published.",
    },
  },
  incident_contact: {
    description: "The Council's designated contacts who receive security incident notices.",
    columns: {
      full_name: "Name of the contact.",
      title: "Job title.",
      email: "Address the notice is sent to.",
      active: "Whether the contact currently receives notices.",
    },
  },
  incident_event: {
    description: "Append-only history of each security incident.",
    columns: {
      incident_id: "Incident the entry belongs to (security_incident.id).",
      at: "When the event happened.",
      actor: "User who caused the event (app_user.id).",
      kind: "recorded, notified, remediation_reported or remediation_completed.",
      detail: "Short detail about the event.",
    },
  },
  incident_remediation: {
    description: "Remediation reports for security incidents. Each update is a new row; the latest one counts.",
    columns: {
      incident_id: "Incident the report belongs to (security_incident.id).",
      root_cause: "What caused the incident.",
      actions: "What was done to contain and repair it.",
      prevention: "Plan to reduce the risk of a repeat.",
      completed_on: "Date remediation was finished. Empty while work continues.",
    },
  },
  initiative: {
    description: "Council initiatives that fund organizations, one row per initiative per fiscal year.",
    columns: {
      code: "Short code, for example CI-27-014.",
      name: "Initiative name.",
      category: "Program category.",
      description: "What the initiative funds.",
      total_funding: "Total dollars allocated to the initiative.",
      administering_agency: "City agency that administers the initiative.",
    },
  },
  initiative_lineage: {
    description: "Links between an initiative and the initiative that replaced it in a later year.",
    columns: {
      predecessor_id: "Earlier initiative (initiative.id).",
      successor_id: "Later initiative (initiative.id).",
      kind: "carry, rename or combine.",
      note: "Explanation.",
    },
  },
  organization: {
    description: "Funded organizations and agencies, the master list checked on every report.",
    columns: {
      ein: "Employer Identification Number.",
      legal_name: "Legal name.",
      dba_name: "Name the organization operates under, if different.",
      org_type: "cbo (community-based organization) or agency.",
      borough: "Borough of the main address.",
      council_district: "Council district of the main address.",
      address_line: "Street address.",
      city: "City.",
      state: "State.",
      postal_code: "ZIP code.",
      phone: "Main phone number.",
      website: "Web address.",
      mission: "Mission statement.",
      founded_year: "Year founded.",
      annual_budget: "Annual operating budget in dollars.",
    },
  },
  outbox: {
    description: "Every email the system queued, with its full text.",
    columns: {
      to_email: "Recipient address.",
      template: "Kind of message.",
      subject: "Subject line.",
      body_text: "Message text.",
      status: "queued, sent or failed.",
      reminder_key: "Key that stops the same reminder being queued twice in one day.",
    },
  },
  question: {
    description: "Library of reusable questions that forms are built from.",
    columns: {
      question_key: "Stable key of the question.",
      scope: "standard (every form) or initiative (one initiative).",
      label: "Question text shown to the submitter.",
      help: "Help text shown under the question.",
      field_type: "Kind of answer: text, number, currency, percent, select, table and so on.",
      required: "Whether an answer is required.",
      options: "Allowed choices for drop-down questions.",
      max_length: "Longest allowed answer in characters.",
      max_words: "Longest allowed answer in words.",
      visible_when: "Condition that makes the question appear.",
      table_columns: "Columns of a table question.",
    },
  },
  reminder_rule: {
    description: "Rules that queue reminder emails relative to a due date.",
    columns: {
      period_id: "Reporting period the rule applies to (reporting_period.id).",
      offset_days: "Days from the due date. Negative is before.",
      template_subject: "Subject of the reminder.",
      template_body: "Text of the reminder.",
      active: "Whether the rule runs.",
    },
  },
  reporting_period: {
    description: "Mid-year and year-end reporting periods.",
    columns: {
      label: "Name of the period.",
      starts_on: "First day covered.",
      ends_on: "Last day covered.",
      due_on: "Date reports are due.",
    },
  },
  saved_query: {
    description: "Searches Finance staff saved.",
    columns: { owner: "User who saved the search (app_user.id).", name: "Name of the saved search.", params: "Filters stored with the search." },
  },
  security_incident: {
    description: "Append-only record of each security incident, with the deadlines for notice and remediation.",
    columns: {
      detected_at: "When the incident was detected.",
      description: "What happened.",
      affected_data: "Which data was or may have been affected.",
      severity: "low, moderate, high or critical.",
      notify_due_at: "Deadline to notify the Council: 24 hours after detection.",
      remediation_due_at: "Deadline for the remediation report: 7 days after detection.",
      notified_at: "When the designated contacts were notified.",
      contacts_notified: "Number of designated contacts notified.",
    },
  },
  submission: {
    description: "A report an organization started or submitted for one award and one reporting period.",
    columns: {
      reference_no: "Report reference, for example LL-26YE-00001.",
      assignment_id: "Award the report is for (assignment.id).",
      period_id: "Reporting period (reporting_period.id).",
      form_version_id: "Form version the report was created on (form_version.id).",
      revision: "Number of times the report has been submitted or corrected.",
      lock_version: "Counter that stops two people overwriting each other.",
      started_by: "User who started the report (app_user.id).",
      submitted_by: "User who submitted the report (app_user.id).",
      submitted_at: "When the report was submitted.",
      last_save_id: "Identifier of the last autosave, used to ignore duplicates.",
    },
  },
  submission_revision: {
    description: "Append-only snapshot of a report each time it was submitted or corrected.",
    columns: {
      revision: "Revision number.",
      kind: "submit or correction.",
      snapshot: "Complete copy of the report at that moment.",
      sha256: "Fingerprint of the snapshot.",
      actor: "User who submitted or corrected (app_user.id).",
      reason: "Reason given for a correction.",
    },
  },
  support_message: {
    description: "Messages in a help request conversation.",
    columns: {
      request_id: "Help request the message belongs to (support_request.id).",
      author: "User who wrote the message (app_user.id).",
      from_staff: "Whether a Finance administrator wrote it.",
      body: "Message text.",
    },
  },
  support_request: {
    description: "Help requests, with the time of the first response measured against the 24 hour target.",
    columns: {
      requester: "User who asked for help (app_user.id).",
      category: "account, password, report, data or other.",
      subject: "Short summary.",
      body: "What the person asked.",
      first_response_at: "When Finance first replied.",
      first_responder: "User who first replied (app_user.id).",
      closed_at: "When the request was closed.",
    },
  },
  training_module: {
    description: "Training modules and the roles each one is required for.",
    columns: {
      key: "Short key of the module.",
      title: "Name of the module.",
      audience: "Roles that must complete the module.",
      position: "Display order.",
    },
  },
  training_record: {
    description: "Training each Finance user has completed.",
    columns: {
      user_id: "Finance user who completed the module (app_user.id).",
      module_key: "Module completed (training_module.key).",
      completed_on: "Date completed.",
    },
  },
  uat_defect: {
    description: "Defects found during user acceptance testing.",
    columns: {
      session_id: "Test session the defect came from (uat_session.id).",
      description: "What went wrong.",
      severity: "minor, major or critical.",
      fixed_on: "Date the fix was confirmed.",
    },
  },
  uat_session: {
    description: "User acceptance test sessions: one scenario, one tester, one result.",
    columns: {
      session_on: "Date of the session.",
      scenario: "Scenario that was tested.",
      tester_name: "Name of the tester.",
      tester_role: "Role or team of the tester.",
      result: "passed, failed or blocked.",
      notes: "Notes from the session.",
    },
  },
};

export function describeColumn(table: string, column: string): string | null {
  return TABLES[table]?.columns[column] ?? COMMON_COLUMNS[column] ?? null;
}

export const NOT_EXPORTED: { table: string; reason: string }[] = [
  { table: "auth_attempt", reason: "Sign-in throttle counters. They hold network details and no business data." },
  { table: "password_token", reason: "One-time password links. These are credentials." },
  { table: "revoked_session", reason: "Signed-out session identifiers. These are credentials." },
  { table: "demo_reset", reason: "Internal log of environment resets." },
  { table: "schema_migration", reason: "Internal record of database upgrades." },
];

export const NOT_EXPORTED_COLUMNS: { table: string; column: string; reason: string }[] = [
  { table: "app_user", column: "password_hash", reason: "Credential." },
  { table: "app_user", column: "session_version", reason: "Internal session counter." },
];

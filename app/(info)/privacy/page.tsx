import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/shell/info-page";

export const metadata: Metadata = { title: "Privacy", description: "What information LedgerLine keeps, why it is kept, who can see it and how long it is kept." };

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      updated="October 2026"
      intro={<p>This page explains what information LedgerLine keeps, why it is kept, who can see it and how long it is kept. LedgerLine is operated by the LedgerLine administrator for Council Finance and the organizations it funds.</p>}
    >
      <h2 id="what-we-keep">What LedgerLine keeps</h2>
      <h3>Your account</h3>
      <p>
        Your name, work email address, job title, role and, for funded organizations, the organization you report for. Accounts are created by a Finance administrator. Your password is stored only as a one-way hash, so no one can read it, including administrators. Password reset links are also stored only as a hash and stop working after 30 minutes.
      </p>
      <h3>Reports and documents</h3>
      <p>
        The answers, budget lines and supporting documents your organization enters for each report, and organization details such as address, contacts and mission. Supporting documents can be PDF, Word, Excel or CSV files of up to 25 MB each, with no more than 20 files on one report.
      </p>
      <h3>Emails LedgerLine prepares</h3>
      <p>LedgerLine writes submission confirmations, requests for changes, reminders and password reset messages. A copy of each message, with the address it is for, is kept in an outbox that Finance staff can see.</p>
      <h3>Activity records</h3>
      <p>
        LedgerLine records who did what and when: sign-ins, saves, submissions, status changes, corrections, flags and messages. These records support the review of public funds. LedgerLine does not record your network address or browser in these records.
      </p>
      <h3>Sign-in attempts</h3>
      <p>To slow down password guessing, LedgerLine keeps a short record of each attempt to enter an access code or sign in, with the network address it came from and, for sign-in, the email address entered. These attempt records are deleted after one day.</p>

      <h2 id="how-it-is-used">How it is used</h2>
      <ul>
        <li>to let funded organizations file mid-year and year-end reports on Council-funded initiatives</li>
        <li>to let Council Finance review, correct and accept those reports</li>
        <li>to prepare reminders and notices about reports that are due, late or need changes</li>
        <li>to keep a record of each submitted report and every change made to it</li>
        <li>to protect accounts from misuse</li>
      </ul>
      <p>LedgerLine does not sell this information and does not use it for advertising.</p>

      <h2 id="who-can-see-it">Who can see it</h2>
      <ul>
        <li>People at a funded organization can see only their own organization&apos;s reports and profile.</li>
        <li>Council Finance staff can see all reports so they can review them.</li>
        <li>Finance administrators can also manage user accounts.</li>
      </ul>
      <p>These limits are enforced by the database itself, not only by the pages you see.</p>

      <h2 id="ai-tools">AI drafting tools for Finance staff</h2>
      <p>Two tools available only to Finance staff can use an AI model to prepare a first draft. A person reviews every draft, and nothing a tool drafts is published or sent to an organization until a Finance reviewer approves it.</p>
      <ul>
        <li>
          <strong>Form drafting.</strong> When Finance uploads a Word reporting template, the text of that template is sent to the model to suggest form questions. A Finance administrator checks each suggested question before the form is published.
        </li>
        <li>
          <strong>Notes asking for changes.</strong> When a reviewer asks an organization to change a report, the model can suggest the wording. It receives only the rule that was not met, the name of the question and figures such as the budget total, the award amount or the number of participants. The reviewer edits and approves the note before it is sent.
        </li>
      </ul>
      <p>No names, email addresses, phone numbers or other contact details are sent to the model. Each use is recorded with the reviewer, the time, the model and the draft it produced.</p>
      <p>
        The LedgerLine administrator decides whether these tools use a model at all. If no model is set up, or the model cannot be reached, LedgerLine drafts with fixed rules instead and nothing is sent outside LedgerLine. The administrator can also turn off AI drafting of notes with a system setting. These are administrator settings, not choices you can change from your account.
      </p>

      <h2 id="cookies">Cookies and browser storage</h2>
      <p>LedgerLine uses only the cookies it needs to work:</p>
      <ul>
        <li>
          <strong>ll_gate</strong> remembers that you entered the access code. It lasts 7 days.
        </li>
        <li>
          <strong>ll_session</strong> keeps you signed in. It ends after 8 hours or when you sign out.
        </li>
        <li>
          <strong>ll_nav</strong> is set only for Finance staff who collapse the side menu, and remembers that choice for one year.
        </li>
      </ul>
      <p>While you fill in a report, your browser also stores which section you were last on so the report can open there next time. This stays on your device.</p>
      <p>There are no analytics or advertising cookies.</p>

      <h2 id="how-long">How long it is kept</h2>
      <p>
        Submitted reports, every revision of them, the supporting documents sent with them and the activity records are kept as part of the record of Council funding. The database rejects any change to or deletion of these records, and LedgerLine does not delete them automatically. Draft reports can be changed by your organization until they are submitted. Sign-in attempt records are deleted after one day.
      </p>

      <h2 id="questions">Questions</h2>
      <p>
        If you think information about you or your organization is wrong, or you have a question about this page, contact the LedgerLine administrator or Council Finance. See <Link href="/help#contact">Help</Link>.
      </p>
    </InfoPage>
  );
}

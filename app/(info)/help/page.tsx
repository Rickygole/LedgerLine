import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/shell/info-page";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <InfoPage
      title="Help"
      updated="October 2026"
      intro={
        <>
          <p>Answers to common questions about signing in and filing reports, and who to contact when you need more help.</p>
          <nav aria-label="On this page" className="mt-4 text-base leading-7">
            <ul className="list-disc pl-6">
              <li>
                <a href="#sign-in" className="text-link underline underline-offset-2 hover:text-link-hover">Problems signing in</a>
              </li>
              <li>
                <a href="#reports" className="text-link underline underline-offset-2 hover:text-link-hover">Questions about reports</a>
              </li>
              <li>
                <a href="#contact" className="text-link underline underline-offset-2 hover:text-link-hover">Contact and support hours</a>
              </li>
            </ul>
          </nav>
        </>
      }
    >
      <h2 id="sign-in">Problems signing in</h2>
      <h3>I forgot my password</h3>
      <p>Ask a Finance administrator for a password reset link. The link is issued for the work email on your account, works once and stops working 30 minutes after it is issued. Your new password must be at least 12 characters and cannot be your email address.</p>
      <h3>My email and password are not accepted</h3>
      <ul>
        <li>Use the work email address your account was set up with.</li>
        <li>Check that Caps Lock is off. Passwords are case sensitive.</li>
        <li>If you recently reset your password, use the new one.</li>
      </ul>
      <p>If it still does not work, ask for a reset link as described above.</p>
      <h3>I do not have an account</h3>
      <p>Council Finance creates accounts. Ask your organization&apos;s main contact for LedgerLine, or Council Finance, to add you. Each person needs their own account.</p>
      <h3>I was asked for an access code</h3>
      <p>LedgerLine is available by invitation, and asks for an access code before the sign-in page. If you do not have it, ask the person who invited you.</p>
      <h3>I was signed out</h3>
      <p>For security you are signed out after 8 hours. Sign in again. Anything you saved is kept.</p>

      <h2 id="reports">Questions about reports</h2>
      <h3>Where do I find my reports?</h3>
      <p>
        <strong>My reports</strong> lists every report due for your organization, one row for each initiative and reporting period. Overdue reports and reports with requested changes are listed first.
      </p>
      <h3>Can I save and come back later?</h3>
      <p>Yes. Changes are saved automatically as you work, and the top of the report shows when they were last saved. Choose Save and exit to leave. The draft stays in My reports until you submit it, and anyone at your organization with an account can continue it.</p>
      <h3>Why can I not submit?</h3>
      <p>LedgerLine checks the report before it is sent. The list at the top of the form shows each problem and links to the question. A common one is the budget: the total of the budget lines must equal the award amount.</p>
      <h3>Finance asked for changes</h3>
      <p>The report shows Changes requested in My reports, and the note from Finance appears at the top of the report. Make the changes and submit again. The earlier version is kept.</p>
      <h3>What happens after I submit?</h3>
      <p>You get a reference number that starts with LL-. Keep it for your records. Finance reviews the report and either accepts it or asks for changes. You can follow the status in My reports and Submission history.</p>
      <h3>Questions about award amounts or what to report</h3>
      <p>Contact Council Finance. LedgerLine shows the award amounts and reporting periods Finance has set up, but it cannot change them.</p>

      <h2 id="contact">Contact and support hours</h2>
      <ul>
        <li>
          <strong>Funded organizations:</strong> contact your LedgerLine administrator first, or Council Finance.
        </li>
        <li>
          <strong>Council Finance staff:</strong> contact a Finance administrator for account, access or form questions.
        </li>
      </ul>
      <p>
        Support hours are <strong>Monday to Friday, 9 AM to 5 PM ET</strong>.
      </p>
      <p>When you get in touch, include your name, your organization, the report reference number if there is one, the page you were on and what happened. Never send your password.</p>
      <p>
        For help with access needs, see <Link href="/accessibility">Accessibility</Link>.
      </p>
    </InfoPage>
  );
}

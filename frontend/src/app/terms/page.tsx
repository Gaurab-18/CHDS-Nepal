'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function TermsPage() {
  const router = useRouter();
  const headerRef = useRef<HTMLHeadingElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('dark');

    const loadGsap = async () => {
      try {
        const gsap = (await import('gsap')).default;
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');
        gsap.registerPlugin(ScrollTrigger);

        if (headerRef.current) {
          gsap.from(headerRef.current, { opacity: 0, y: -30, duration: 0.8, ease: 'power3.out' });
        }

        if (sectionsRef.current) {
          const cards = sectionsRef.current.querySelectorAll('section');
          gsap.from(cards, {
            opacity: 0, y: 40, duration: 0.6, stagger: 0.1, ease: 'power2.out',
            scrollTrigger: {
              trigger: sectionsRef.current,
              start: 'top 85%',
              toggleActions: 'play none none reverse',
            },
          });
        }
      } catch { /* GSAP not critical */ }
    };

    loadGsap();
  }, []);

  const acceptTerms = async () => {
    try {
      await fetch('/api/v1/auth/accept-terms', { method: 'POST', credentials: 'include' });
    } catch { /* fire-and-forget */ }
    localStorage.setItem('chds_terms_accepted', 'accepted');
    localStorage.setItem('chds_terms_accepted_at', new Date().toISOString());
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="fixed inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/10 via-transparent to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto px-4 py-16">
        <div ref={headerRef}>
          <a href="/login" className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors mb-8">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to login
          </a>

          <div className="mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Last updated June 2025 | Version 1.0
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-3">Terms & Conditions</h1>
          <p className="text-gray-400 text-sm mb-2 leading-relaxed">
            Including HIPAA-Aligned Privacy Safeguards. These Terms and Conditions govern your access to and use of the
            CHDS Nepal Centralised Healthcare Data Sharing System (the &quot;System&quot;).
          </p>
          <p className="text-amber-400/80 text-xs mb-10 leading-relaxed border-l-2 border-amber-500/30 pl-3">
            <strong>Important:</strong> You must accept these Terms to use the System. If you do not accept,
            you must immediately cease all use and may request deletion of your account. CHDS Nepal limits its
            liability to the maximum extent permitted by the laws of Nepal.
          </p>
        </div>

        <div ref={sectionsRef} className="space-y-4 mb-12">
          {/* ── 1. Acceptance of Terms ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              By accessing, registering for, or using the CHDS Nepal platform (the &quot;System&quot;), you confirm that you
              have read, understood, and agree to be bound by these Terms and Conditions in their entirety. Access to
              the System is strictly conditional upon your acceptance of these Terms.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              If you do not agree to any part of these Terms, you must immediately cease all use of the System and may
              request deletion of your account. Continued use of the System following notification of any amendment to
              these Terms constitutes your binding acceptance of the amended Terms.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              These Terms constitute a legally binding agreement between you and CHDS Nepal. CHDS Nepal reserves the
              right to deny access, suspend or permanently terminate accounts, and pursue appropriate legal remedies
              against any user who violates these Terms or uses the System without authorisation.
            </p>
          </section>

          {/* ── 2. Nature of the System and No Warranty ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">2. Nature of the System and No Warranty</h2>
            <p className="text-sm text-amber-400/80 leading-relaxed mb-3 uppercase tracking-wider font-semibold">
              THE SYSTEM IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT ANY WARRANTY OF ANY KIND,
              WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW,
              CHDS NEPAL EXPRESSLY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, RELIABILITY, COMPLETENESS, AND
              NON-INFRINGEMENT.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              CHDS Nepal does not warrant that: (a) the System will be uninterrupted, error-free, or free of viruses
              or other harmful components; (b) defects in the System will be corrected; (c) the System or the servers
              that make it available are free from malicious code; or (d) information obtained through the System will
              be accurate, complete, or current.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              You acknowledge that the System is a research prototype designed for Kathmandu Valley hospitals. It is
              not a certified medical device and should not be used as a substitute for professional medical judgment.
            </p>
          </section>

          {/* ── 3. Limitation of Liability ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">3. Limitation of Liability &mdash; Comprehensive Exclusion</h2>
            <p className="text-sm text-amber-400/80 leading-relaxed mb-3 uppercase tracking-wider font-semibold">
              TO THE MAXIMUM EXTENT PERMITTED BY THE LAWS OF NEPAL AND ANY OTHER APPLICABLE JURISDICTION, IN NO EVENT
              SHALL CHDS NEPAL, ITS ADMINISTRATORS, DEVELOPERS, OFFICERS, AFFILIATES, OR SERVICE PROVIDERS BE LIABLE
              TO YOU OR ANY THIRD PARTY FOR ANY LOSS OR DAMAGE ARISING FROM YOUR USE OF THE SYSTEM.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              CHDS Nepal&apos;s total aggregate liability to you for any and all claims arising under or in connection
              with these Terms, the System, or any services provided hereunder shall not exceed NPR 10,000 (ten thousand
              Nepalese Rupees) or the amount actually paid by you to CHDS Nepal in the twelve months preceding the
              claim, whichever is lower. This limitation applies regardless of the legal theory upon which any claim
              is based. This limitation of liability is a fundamental element of the basis of the bargain between you
              and CHDS Nepal. The System would not be provided to you without these limitations.
            </p>

            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-teal-700 text-white p-2 text-left font-semibold w-1/2">CHDS Nepal is NOT liable for</th>
                    <th className="bg-teal-700 text-white p-2 text-left font-semibold w-1/2">Your responsibility</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {[
                    ['Breach from user credential negligence (lost/shared passwords, 2FA codes, recovery keys)', 'Maintaining strong, unique passwords and enabling 2FA'],
                    ['Breach from unsecured or shared devices where user failed to log out', 'Logging out after every session on shared or public devices'],
                    ['Exploitation of zero-day vulnerabilities in third-party software or infrastructure dependencies not known at time of incident', 'Reporting any suspected security issues to CHDS Nepal immediately'],
                    ['Actions of privileged insiders despite industry-standard administrative, physical, and technical safeguards (HIPAA Security Rule 45 CFR § 164.306)', 'Notifying CHDS Nepal of any suspicious or unexpected access visible in your audit log'],
                    ['Force majeure events including natural disasters, war, cyberterrorism, or government-mandated shutdowns', 'Understanding the System is a best-effort research prototype'],
                    ['Loss of data or access arising from lawful court orders, government directives, or regulatory actions', 'Complying with all applicable laws when using the System'],
                    ['Indirect, incidental, special, consequential, punitive or exemplary damages of any kind', 'Seeking independent legal advice before relying on System availability for critical healthcare decisions'],
                  ].map(([left, right], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-red-950/30' : 'bg-red-900/20'}>
                      <td className="border border-gray-700 p-2">{left}</td>
                      <td className="border border-gray-700 p-2">{right}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 4. User Responsibilities and Indemnification ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">4. User Responsibilities and Indemnification</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              You are solely and exclusively responsible for all activity conducted under your account. Your obligations
              include, without limitation:
            </p>
            <ol className="text-sm text-gray-400 leading-relaxed space-y-1 mb-3 list-inside list-[lower-alpha]">
              <li>Maintaining the strict confidentiality of your login credentials, password, two-factor authentication codes, and account recovery keys at all times.</li>
              <li>Immediately notifying CHDS Nepal at the earliest opportunity upon discovering or suspecting any unauthorised access to or use of your account.</li>
              <li>Ensuring you fully log out of the System at the conclusion of each session, particularly when using shared, public, or third-party devices.</li>
              <li>Never sharing, transferring, selling, or otherwise disclosing your account credentials to any third party under any circumstances.</li>
              <li>Using a strong, unique password of no fewer than twelve characters incorporating uppercase and lowercase letters, numerals, and special characters, and enabling two-factor authentication on your account.</li>
              <li>Ensuring that any device you use to access the System is protected by appropriate security measures, including up-to-date antivirus software and operating system patches.</li>
            </ol>
            <p className="text-sm text-gray-400 leading-relaxed">
              <strong>You agree to fully indemnify, defend, and hold harmless</strong> CHDS Nepal, its administrators,
              developers, and affiliates from and against any and all claims, demands, actions, proceedings, damages,
              losses, liabilities, costs, and expenses (including reasonable legal fees) arising from or in connection
              with: (i) your use or misuse of the System; (ii) your violation of these Terms; (iii) your violation of
              any applicable law or regulation; (iv) your infringement of any third-party rights; or (v) any
              unauthorised access to the System that occurs through your account as a result of your failure to comply
              with your security obligations under these Terms. This indemnification obligation survives the termination
              of your account and these Terms.
            </p>
          </section>

          {/* ── 5. Data Protection and HIPAA-Aligned Security Safeguards ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">5. Data Protection and HIPAA-Aligned Security Safeguards</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-3">
              CHDS Nepal implements technical, administrative, and physical safeguards aligned with the HIPAA Security
              Rule (45 CFR §§ 164.302&ndash;318) as a best-practice framework. These include:
            </p>
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="bg-teal-700 text-white p-2 text-left font-semibold">Safeguard Category</th>
                    <th className="bg-teal-700 text-white p-2 text-left font-semibold">Implementation</th>
                    <th className="bg-teal-700 text-white p-2 text-left font-semibold">HIPAA Reference</th>
                  </tr>
                </thead>
                <tbody className="text-gray-400">
                  {[
                    ['Encryption at Rest', 'AES-256 via PostgreSQL pgcrypto on all PHI fields', '45 CFR § 164.312(a)(1)'],
                    ['Encryption in Transit', 'TLS 1.3 on all API and web traffic', '45 CFR § 164.312(e)(1)'],
                    ['Access Controls', 'RBAC with four tiers: Patient, Clinician, Admin, Auditor', '45 CFR § 164.312(a)(2)(i)'],
                    ['Audit Controls', 'Immutable append-only audit log : no UPDATE/DELETE permitted', '45 CFR § 164.312(b)'],
                    ['Integrity Controls', 'Tamper-evident audit trail with cryptographic receipts', '45 CFR § 164.312(c)(1)'],
                    ['Authentication', 'JWT + mandatory 2FA (TOTP) for Clinician, Admin, Auditor roles', '45 CFR § 164.312(d)'],
                    ['Consent Management', 'Explicit opt-in consent per patient, 90-day expiry, revocable at any time', '45 CFR § 164.506'],
                    ['Minimum Necessary', 'RBAC ensures no user accesses more data than their role requires', '45 CFR § 164.514(d)'],
                    ['Emergency Override', 'Break-glass access with mandatory post-access logging and patient notification', '45 CFR § 164.512(j)'],
                  ].map(([cat, impl, ref], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-gray-800/50' : 'bg-gray-800/20'}>
                      <td className="border border-gray-700 p-2 font-medium">{cat}</td>
                      <td className="border border-gray-700 p-2">{impl}</td>
                      <td className="border border-gray-700 p-2 font-mono text-emerald-400">{ref}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              Notwithstanding CHDS Nepal&apos;s implementation of these safeguards, you acknowledge that no system is
              absolutely secure and that CHDS Nepal cannot guarantee the absolute security of your data. The
              implementation of these safeguards does not create any additional liability on the part of CHDS Nepal
              beyond what is expressly stated in these Terms.
            </p>
          </section>

          {/* ── 6. Consent-Based Access Control ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">6. Consent-Based Access Control</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              Clinicians must obtain your explicit, informed consent before viewing any record in the System. Consent
              is governed as follows:
            </p>
            <ol className="text-sm text-gray-400 leading-relaxed space-y-1 mb-3 list-inside list-[lower-alpha]">
              <li>All consents expire automatically after 90 days from the date of grant and must be renewed by you to remain effective.</li>
              <li>You may revoke any active consent at any time from your patient dashboard. Revocation takes immediate effect.</li>
              <li>CHDS Nepal shall not be liable for any access that was lawfully authorised by you at the time it occurred, even if you subsequently revoke consent.</li>
              <li><strong>Emergency Override:</strong> In life-threatening situations where you are unable to provide timely consent, a clinician may access your records under a logged break-glass emergency override as permitted by HIPAA (45 CFR § 164.512(j)). Every such override is immediately logged and a notification is sent to your registered contact. CHDS Nepal shall not be liable for any access conducted under a bona fide emergency override.</li>
              <li><strong>Hospital Consent:</strong> When a hospital submits data to the System on your behalf, an implicit hospital-level consent record is created and you are notified. You retain the right to revoke hospital consent at any time from your dashboard.</li>
            </ol>
          </section>

          {/* ── 7. Immutable Audit Trail ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">7. Immutable Audit Trail</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              Every access to, submission of, or action upon data within the System is recorded in an immutable,
              append-only audit trail stored in a database table restricted to INSERT operations only &mdash; no
              UPDATE or DELETE operations are permitted by the application database user.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              You may view your complete audit history from your patient dashboard at any time. Audit logs cannot be
              modified, deleted, or suppressed by any user, including administrators, except upon receipt of a lawful
              court order from a court of competent jurisdiction in Nepal, in which case CHDS Nepal will comply with
              the minimum legally required disclosure.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              The existence of an audit trail does not guarantee prevention of unauthorised access in real time &mdash;
              it is a record of what occurred. CHDS Nepal&apos;s liability for any access recorded in the audit trail is
              limited as set out in Clause 3.
            </p>
          </section>

          {/* ── 8. Data Retention and the Right to Deletion ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">8. Data Retention and the Right to Deletion</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              Your Protected Health Information (PHI) is retained within the System until you submit a formal Data Wipe
              Request through your account dashboard. Upon receipt of a valid request:
            </p>
            <ol className="text-sm text-gray-400 leading-relaxed space-y-1 mb-3 list-inside list-[lower-alpha]">
              <li>An administrator will review and process the deletion within 72 business hours of the request.</li>
              <li>Upon completion, all PHI that identifies you will be permanently and irreversibly destroyed or cryptographically anonymised such that re-identification is not reasonably possible.</li>
              <li>CHDS Nepal may retain de-identified or aggregated data that can no longer reasonably identify you, as permitted by HIPAA Safe Harbour provisions (45 CFR § 164.514(b)), for legitimate operational, academic, and analytical purposes.</li>
              <li>Records submitted by hospitals on your behalf may be subject to the hospital&apos;s own data retention obligations under applicable law. CHDS Nepal will use reasonable endeavours to honour deletion requests but cannot guarantee deletion of data that a hospital is legally required to retain in its own systems.</li>
            </ol>
          </section>

          {/* ── 9. Breach Notification ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">9. Breach Notification</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              In the event of a breach of unsecured PHI as defined under HIPAA (45 CFR § 164.402), CHDS Nepal will:
            </p>
            <ol className="text-sm text-gray-400 leading-relaxed space-y-1 mb-3 list-inside list-[lower-alpha]">
              <li>Promptly investigate the breach and take all reasonable steps to contain and mitigate its impact within the shortest practicable timeframe.</li>
              <li>Notify affected individuals without unreasonable delay and in no case later than 60 days following the discovery of the breach, in a manner consistent with the HIPAA Breach Notification Rule (45 CFR §§ 164.400&ndash;414).</li>
              <li>Provide notification that includes: a description of the breach; the categories of information involved; the steps affected individuals should take to protect themselves; a description of CHDS Nepal&apos;s investigation and remediation steps; and contact details for follow-up inquiries.</li>
              <li>Apply security patches and remediate identified vulnerabilities within a commercially reasonable timeframe following discovery.</li>
            </ol>
            <p className="text-sm text-gray-400 leading-relaxed italic">
              Notwithstanding the above, CHDS Nepal&apos;s obligation to provide breach notification does not in itself
              create any additional liability beyond what is expressly stated in Clause 3. The provision of a breach
              notification shall not be construed as an admission of liability by CHDS Nepal.
            </p>
          </section>

          {/* ── 10. Governing Law ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">10. Governing Law, Jurisdiction, and Dispute Resolution</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              These Terms and Conditions are governed by and construed in accordance with the laws of Nepal, including
              but not limited to the Privacy Act 2075 (2018), the Electronic Transactions Act 2063 (2006), and any
              other applicable Nepalese legislation. References to HIPAA are incorporated as a best-practice design
              standard and do not create any submission to the jurisdiction of United States courts or regulatory
              authorities.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              Any dispute, controversy, or claim arising out of or in connection with these Terms, or the breach,
              termination, or invalidity thereof, shall first be subject to good-faith negotiation between the parties
              for a period of 30 days. If unresolved, the dispute shall be submitted to mediation in Kathmandu, Nepal.
              If mediation fails, the dispute shall be finally resolved by the courts of competent jurisdiction in
              Kathmandu, Nepal.
            </p>
            <p className="text-sm text-amber-400/80 leading-relaxed uppercase tracking-wider font-semibold">
              YOU EXPRESSLY WAIVE ANY RIGHT TO PARTICIPATE IN A CLASS ACTION LAWSUIT OR CLASS-WIDE ARBITRATION
              AGAINST CHDS NEPAL. ALL CLAIMS MUST BE BROUGHT ON AN INDIVIDUAL BASIS ONLY.
            </p>
          </section>

          {/* ── 11. Miscellaneous ── */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5 hover:border-gray-700 transition-colors">
            <h2 className="text-base font-semibold text-white mb-2">11. Miscellaneous</h2>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              <strong>Severability:</strong> If any provision of these Terms is held by a court of competent
              jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum
              extent necessary to make it enforceable, or severed if modification is not possible, and the remaining
              provisions shall continue in full force and effect.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              <strong>No Waiver:</strong> CHDS Nepal&apos;s failure to enforce any right or provision of these Terms
              shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an
              authorised representative of CHDS Nepal to be effective.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              <strong>Entire Agreement:</strong> These Terms, together with the Privacy Policy and any additional
              terms applicable to specific features of the System, constitute the entire agreement between you and
              CHDS Nepal with respect to the System and supersede all prior agreements, understandings, and
              negotiations.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed mb-2">
              <strong>Force Majeure:</strong> CHDS Nepal shall not be liable for any failure or delay in performance
              resulting from causes beyond its reasonable control, including natural disasters, acts of government,
              cyberterrorism, infrastructure failures, pandemics, or any other event constituting force majeure under
              Nepalese law.
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              <strong>Changes to Terms:</strong> CHDS Nepal reserves the right to modify these Terms at any time.
              Material changes will be notified via in-app notification and, where practicable, by email to your
              registered address, with not less than 14 days&apos; notice before the changes take effect. Continued
              use of the System after the effective date of any amendment constitutes acceptance of the amended Terms.
            </p>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/80 backdrop-blur-sm p-6 text-center">
          <p className="text-sm text-gray-400 mb-2">
            By clicking &quot;I Accept&quot; below, you acknowledge that you have read, understood, and agree to be
            bound by these Terms and Conditions, including the limitation of liability provisions. If you do not agree,
            click &quot;Decline&quot; &mdash; you will not be able to use the System.
          </p>
          <p className="text-xs text-gray-600 mb-4">
            These terms are designed to comply with HIPAA Privacy Rule (45 CFR § 164.500&ndash;534),
            HIPAA Security Rule (45 CFR § 164.302&ndash;318), and HIPAA Breach Notification Rule
            (45 CFR § 164.400&ndash;414) as a best-practice reference framework.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={acceptTerms}
              className="px-8 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 transition-colors"
            >
              I Accept
            </button>
            <a href="/login" className="px-8 py-2.5 rounded-lg bg-gray-800 text-gray-300 font-semibold text-sm hover:bg-gray-700 transition-colors">
              Decline
            </a>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-gray-600">
          CHDS Nepal &copy; {new Date().getFullYear()} &mdash; Centralised Healthcare Data Sharing System
        </div>
      </div>
    </div>
  );
}

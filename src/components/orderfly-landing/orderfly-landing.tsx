// Orderfly marketing landing for orderfly.dk/ (#814). Mobile-first, static,
// no client JavaScript, no forms and no third-party requests. Styles live in
// orderfly-landing.css and are scoped under `.ofl`.
import {
  BENEFITS, DEMO_MAILTO, EXAMPLE_SHOP_HREF, FAQ, FEATURES, LOGIN_HREF, LOYALTY_POINTS,
  NAV_LINKS, PLANS, STEPS, type IconName,
} from './content';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  options: <><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="18" cy="16" r="3" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  terminal: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9v4M12 9v4M16 9v4" /></>,
  printer: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  star: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" />,
  tag: <><path d="M20 12l-8 8-9-9V3h8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 13h18M12 8S10 3 7.5 4 9 8 12 8zM12 8s2-5 4.5-4S15 8 12 8z" /></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></>,
  store: <><path d="M3 21V8l9-5 9 5v13" /><path d="M9 21v-6h6v6" /></>,
  truck: <><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></>,
};

function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICON_PATHS[name]}</svg>;
}

function Check() {
  return <svg className="ofl-check" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>;
}

function Logo() {
  return <a href="#top" className="ofl-logo" aria-label="Orderfly – til toppen">
    <span className="ofl-logo-mark" aria-hidden="true">o</span><span aria-hidden="true">orderfly</span>
  </a>;
}

function PhoneMock() {
  return <div className="ofl-phone" aria-hidden="true">
    <div className="ofl-phone-notch" />
    <div className="ofl-phone-brand">Dit brand</div>
    <div className="ofl-phone-sub">Afhentning · klar om 20 min</div>
    <div className="ofl-phone-tabs"><span className="is-active">Pizza</span><span>Burgere</span><span>Drikke</span></div>
    {['#F2D3C3', '#E9DFC4', '#CFEBDD'].map(color => <div className="ofl-phone-item" key={color}>
      <span className="ofl-phone-thumb" style={{ background: color }} />
      <span className="ofl-phone-lines"><span /><span /></span>
      <span className="ofl-phone-add">+</span>
    </div>)}
    <div className="ofl-phone-cta"><span>Gå til betaling</span><span>→</span></div>
  </div>;
}

function TerminalMock() {
  return <div className="ofl-terminal" aria-hidden="true">
    <div className="ofl-terminal-head"><span>Ordreterminal</span><span className="ofl-terminal-online">Online</span></div>
    <div className="ofl-terminal-cols">
      <div><small>Nye</small><span className="ofl-ticket is-new"><b>#1042</b>Afhentning</span><span className="ofl-ticket is-new"><b>#1043</b>Levering</span></div>
      <div><small>I gang</small><span className="ofl-ticket"><b>#1039</b>Afhentning</span><span className="ofl-ticket"><b>#1040</b>Levering</span></div>
      <div><small>Klar</small><span className="ofl-ticket is-ready"><b>#1038</b>Klar</span></div>
    </div>
    <div className="ofl-terminal-foot"><Icon name="printer" />Køkkenbon printet automatisk</div>
  </div>;
}

export function OrderflyLanding() {
  return <div className="ofl" id="top">
    <a className="ofl-skip" href="#indhold">Gå til indhold</a>
    <header className="ofl-header">
      <nav className="ofl-nav ofl-wrap" aria-label="Hovedmenu">
        <Logo />
        <ul className="ofl-nav-links">
          {NAV_LINKS.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}
        </ul>
        <div className="ofl-nav-actions">
          <a className="ofl-nav-login" href={LOGIN_HREF}>Log ind</a>
          <a className="ofl-btn ofl-btn-primary ofl-nav-demo" href={DEMO_MAILTO}>Book en demo</a>
        </div>
        <details className="ofl-mobile-menu">
          <summary aria-label="Åbn menu"><span className="ofl-burger" aria-hidden="true"><span /><span /><span /></span></summary>
          <div className="ofl-mobile-panel">
            <ul>{NAV_LINKS.map(link => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul>
            <a className="ofl-btn ofl-btn-secondary" href={LOGIN_HREF}>Log ind</a>
            <a className="ofl-btn ofl-btn-primary" href={DEMO_MAILTO}>Book en demo</a>
          </div>
        </details>
      </nav>
    </header>

    <main id="indhold">
      <section className="ofl-hero">
        <div className="ofl-wrap ofl-hero-grid">
          <div className="ofl-hero-copy">
            <p className="ofl-pill">All-in-One til restauranter og take away</p>
            <h1>Din egen online take away. Alt samlet ét sted.</h1>
            <p className="ofl-lead">Orderfly giver din restaurant egen webshop, online betaling, ordreterminal, automatisk bonprint og loyalitetsprogram – i én platform, under dit eget brand.</p>
            <div className="ofl-actions">
              <a className="ofl-btn ofl-btn-primary" href={DEMO_MAILTO}>Book en gratis demo</a>
              <a className="ofl-btn ofl-btn-secondary" href={EXAMPLE_SHOP_HREF}>Se en rigtig webshop</a>
            </div>
            <ul className="ofl-checks">
              <li><Check />Egen adresse: ditbrand.orderfly.dk</li>
              <li><Check />Din egen kundeliste</li>
              <li><Check />Lavet i Danmark, på dansk</li>
            </ul>
          </div>
          <div className="ofl-hero-visual"><TerminalMock /><PhoneMock /></div>
        </div>
      </section>

      <section className="ofl-customers" aria-label="Kunder">
        <div className="ofl-wrap ofl-customers-row">
          <span>Bruges af</span><strong>Esmeralda Pizza</strong>
        </div>
      </section>

      <section className="ofl-section ofl-wrap" aria-labelledby="hvorfor">
        <div className="ofl-intro">
          <p className="ofl-eyebrow">Hvorfor Orderfly</p>
          <h2 id="hvorfor">Stop med at jonglere fem systemer for at sælge take away.</h2>
          <p className="ofl-lead">Webshop ét sted, betaling et andet, printer et tredje og stempelkort på papir. Med Orderfly hænger det hele sammen – fra kunden trykker “Bestil”, til bonen ligger i køkkenet.</p>
        </div>
        <div className="ofl-grid ofl-grid-3">
          {BENEFITS.map(item => <div className="ofl-benefit" key={item.title}><h3>{item.title}</h3><p>{item.text}</p></div>)}
        </div>
      </section>

      <section id="funktioner" className="ofl-section ofl-wrap" aria-labelledby="funktioner-titel">
        <div className="ofl-intro ofl-intro-split">
          <div><p className="ofl-eyebrow">Funktioner</p><h2 id="funktioner-titel">Alt hvad din take away har brug for</h2></div>
          <p>Du slår de moduler til, som passer til din restaurant.</p>
        </div>
        <ul className="ofl-grid ofl-features">
          {FEATURES.map(feature => <li key={feature.title} className={feature.comingSoon ? 'ofl-feature is-soon' : 'ofl-feature'}>
            <span className="ofl-feature-icon"><Icon name={feature.icon} /></span>
            <h3>{feature.title}{feature.comingSoon && <span className="ofl-badge">Kommer snart</span>}</h3>
            <p>{feature.text}</p>
          </li>)}
        </ul>
      </section>

      <section id="saadan" className="ofl-dark" aria-labelledby="saadan-titel">
        <div className="ofl-section ofl-wrap">
          <div className="ofl-intro">
            <p className="ofl-eyebrow">Sådan kommer du i gang</p>
            <h2 id="saadan-titel">Fra menukort til første online ordre</h2>
          </div>
          <ol className="ofl-grid ofl-grid-3 ofl-steps">
            {STEPS.map((step, index) => <li key={step.title}><span className="ofl-step-no" aria-hidden="true">{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
          </ol>
        </div>
      </section>

      <section id="loyalitet" className="ofl-section ofl-wrap ofl-loyalty" aria-labelledby="loyalitet-titel">
        <div className="ofl-loyalty-copy">
          <p className="ofl-eyebrow">Loyalitet</p>
          <h2 id="loyalitet-titel">Stempelkortet, kunderne ikke glemmer derhjemme</h2>
          <p className="ofl-lead">Kunden melder sig ind i din Club med e-mail, gemmer kortet på hjemmeskærmen og viser QR-koden ved kassen. Du bestemmer reglerne.</p>
          <ul className="ofl-checks ofl-checks-col">{LOYALTY_POINTS.map(point => <li key={point}><Check />{point}</li>)}</ul>
        </div>
        <div className="ofl-stampcard" aria-hidden="true">
          <div className="ofl-stampcard-head"><b>Dit brand Club</b><span>Mit stempelkort</span></div>
          <div className="ofl-stamps">{Array.from({ length: 10 }, (_, i) => <span key={i} className={i < 7 ? 'is-filled' : ''} />)}</div>
          <p>3 stempler til din belønning</p>
          <div className="ofl-qr"><span /><small>Vis QR-koden ved kassen</small></div>
        </div>
      </section>

      <section id="pakker" className="ofl-soft" aria-labelledby="pakker-titel">
        <div className="ofl-section ofl-wrap">
          <div className="ofl-intro ofl-intro-center">
            <p className="ofl-eyebrow">Pakker</p>
            <h2 id="pakker-titel">Vælg det, der passer til din restaurant</h2>
            <p className="ofl-lead">Prisen afhænger af antal afdelinger og moduler. Book en demo, så får du et konkret tilbud.</p>
          </div>
          <ul className="ofl-grid ofl-grid-3 ofl-plans">
            {PLANS.map(plan => <li key={plan.name} className={plan.highlighted ? 'ofl-plan is-highlighted' : 'ofl-plan'}>
              <h3>{plan.name}{plan.highlighted && <span className="ofl-badge ofl-badge-accent">Mest populær</span>}</h3>
              <p>{plan.text}</p>
              <a className={plan.highlighted ? 'ofl-btn ofl-btn-primary' : 'ofl-btn ofl-btn-secondary'} href={DEMO_MAILTO}>Få et tilbud<span className="ofl-sr"> på {plan.name}</span></a>
            </li>)}
          </ul>
        </div>
      </section>

      <section id="faq" className="ofl-section ofl-wrap ofl-faq" aria-labelledby="faq-titel">
        <h2 id="faq-titel">Ofte stillede spørgsmål</h2>
        <div className="ofl-faq-list">
          {FAQ.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
        </div>
      </section>

      <section id="demo" className="ofl-wrap ofl-cta-wrap" aria-labelledby="demo-titel">
        <div className="ofl-cta">
          <div>
            <h2 id="demo-titel">Klar til din egen online take away?</h2>
            <p>Book en uforpligtende demo, så viser vi, hvordan Orderfly kan se ud for din restaurant.</p>
          </div>
          <a className="ofl-btn ofl-btn-dark" href={DEMO_MAILTO}>Book en demo</a>
        </div>
      </section>
    </main>

    <footer className="ofl-footer">
      <div className="ofl-wrap ofl-footer-grid">
        <div className="ofl-footer-brand"><Logo /><p>All-in-One online take away til restauranter.</p></div>
        <nav aria-label="Produkt"><h2>Produkt</h2><a href="#funktioner">Funktioner</a><a href="#loyalitet">Loyalitet</a><a href="#pakker">Pakker</a></nav>
        <nav aria-label="For restauranter"><h2>For restauranter</h2><a href={LOGIN_HREF}>Log ind</a><a href={DEMO_MAILTO}>Book en demo</a><a href="#faq">FAQ</a></nav>
      </div>
    </footer>
  </div>;
}

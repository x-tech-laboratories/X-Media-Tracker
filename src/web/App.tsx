// The page: the sign-in in a browser, the shell around every section, and the router between them.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Fragment, useEffect } from "react";
import { create_accounts_client, type Me } from "@x-tech-laboratories/x-libs/web/accounts";
import { AccountView, users_settings } from "@x-tech-laboratories/x-libs/web/react/accounts";
import { SyncCertificatePrompt } from "@x-tech-laboratories/x-libs/web/react/certificates";
import { Shell, use_route } from "@x-tech-laboratories/x-libs/web/react/shell";
import { SignInForm, use_account } from "@x-tech-laboratories/x-libs/web/react/sign_in";
import { theme_choice } from "@x-tech-laboratories/x-libs/web/theme";

import { data_watch, page } from "./api.ts";
import { page_features } from "./features.tsx";
import { HistoryView } from "./history/HistoryView.tsx";
import { SettingsView } from "./settings/SettingsView.tsx";
import { Sidebar } from "./Sidebar.tsx";

// ── Sections ─────────────────────────────────────────────────────────────────

const theme = theme_choice("x-media-tracker-theme");

// Relative, so a server behind a proxy under a folder keeps it.
const accounts = create_accounts_client({ base: "api" });

// The logo beside the app's name, relative like the page's own icon link.
const app_icon = "./icon.svg";

// Sections outside the features, Your account only for someone signed in on the server.
const own_sections = ["settings", "account"];

// ── App ──────────────────────────────────────────────────────────────────────

// A browser signs in to the server; the desktop and phone apps keep their own data and sign in only to sync.
// A device that syncs asks to trust its server's certificate whenever sync fails over it.
function DeviceApp() {
  const { certificates, device } = page();
  return <>
    {device && certificates && <SyncCertificatePrompt device={device} certificates={certificates} subscribe={data_watch.subscribe} />}
    <Pages me={null} />
  </>;
}

export function App() {
  return page().host === "web" ? <SignedInApp /> : <DeviceApp />;
}

function SignedInApp() {
  const { account, refresh, sign_out } = use_account(accounts);
  if (account.state === "checking") return null;
  if (account.state === "signed_out") {
    return (
      <Shell brand="X-Media-Tracker" brand_icon={app_icon} theme={theme} user={null}>
        <SignInForm client={accounts} title="X-Media-Tracker" icon={app_icon} on_signed_in={refresh} />
      </Shell>
    );
  }
  return <Pages me={account.me} on_sign_out={() => void sign_out()} />;
}

function Pages({ me, on_sign_out }: { me: Me | null; on_sign_out?: () => void }) {
  const route = use_route();
  const [named_section = "library", ...rest] = route.parts;
  const feature = page_features.find((candidate) => candidate.id === named_section);
  const is_own = named_section === "settings" || named_section === "history" || (me !== null && own_sections.includes(named_section));
  const section = feature || is_own ? named_section : "library";
  const shown_feature = feature ?? (section === "library" ? page_features[0] : undefined);
  const page = shown_feature?.pages.find((candidate) => candidate.id === rest[0]) ?? shown_feature?.pages[0];
  const own_labels: Record<string, string> = { settings: "Settings", history: "History", account: "Your account" };
  const label = shown_feature ? (rest[0] === "search" ? "Search" : page!.label) : own_labels[section]!;
  const view_key = route.parts.join("/");

  useEffect(() => {
    document.title = `${label} · X-Media-Tracker`;
  }, [label]);

  const view = () => {
    if (shown_feature) return shown_feature.view(feature ? rest : []);
    if (me && section === "account") return <AccountView client={accounts} />;
    if (section === "history") return <HistoryView />;
    // An admin signed in on the server manages users from Settings.
    return <SettingsView server_sections={me ? users_settings({ client: accounts, me }) : []} />;
  };

  return (
    <Shell
      brand="X-Media-Tracker"
      brand_icon={app_icon}
      sidebar={<Sidebar features={page_features} section={section} page={page?.id ?? ""} />}
      tools={page_features.map((each) => <Fragment key={each.id}>{each.top_bar}</Fragment>)}
      theme={theme}
      view_key={view_key}
      user={me?.name}
      user_href="#/account"
      on_logout={on_sign_out}
      settings={{ href: "#/settings", active: section === "settings" }}
    >
      <Fragment key={view_key}>{view()}</Fragment>
    </Shell>
  );
}

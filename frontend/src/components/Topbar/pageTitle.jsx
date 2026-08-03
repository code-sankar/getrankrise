import { useTheme } from "../../context/ThemeContext";

// Capitalised: React only treats a function as a component when its name starts
// with an uppercase letter, and calling useTheme() from a lowercase `pageTitle`
// was a rules-of-hooks violation that happened to work because TopBar renders
// it as <PageTitle/>. The unused theme map it carried (header/btn/popup/…, all
// copied from NotificationBell) is gone — this renders one <h1>.
export default function PageTitle({ title }) {
  const { dark } = useTheme();

  return (
    <h1
      className={`text-xl font-bold tracking-tight ${
        dark ? "text-slate-100" : "text-slate-900"
      }`}
    >
      {title}
    </h1>
  );
}

import { useTheme } from "../../context/ThemeContext";

// Capitalised: React only treats a function as a component when its name starts
// with an uppercase letter, and calling useTheme() from a lowercase `pageTitle`
// was a rules-of-hooks violation that happened to work because TopBar renders
// it as <PageTitle/>. The unused theme map it carried (header/btn/popup/…, all
// copied from NotificationBell) is gone — this renders one <h1>.
export default function PageTitle({ title }) {
  const { dark } = useTheme();

  // `truncate` is load-bearing, not cosmetic. The wrapper in TopBar is
  // `min-w-0` + shrinkable, so at narrow widths it shrinks below the title's
  // natural width — and without an overflow rule the text simply carried on
  // painting, straight across the theme toggle and the notification bell.
  // "Unified Reviews" at 390px overlapped both.
  return (
    <h1
      title={title}
      className={`text-lg sm:text-xl font-bold tracking-tight truncate ${
        dark ? "text-slate-100" : "text-slate-900"
      }`}
    >
      {title}
    </h1>
  );
}

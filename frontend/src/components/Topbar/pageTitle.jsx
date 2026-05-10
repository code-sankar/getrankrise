import { useTheme } from "../../context/ThemeContext";

export default function pageTitle({ title }) {
  const { dark, toggle } = useTheme();
  const theme = {
    header: dark
      ? "bg-slate-900/80 border-slate-800"
      : "bg-white/80 border-slate-200",
    text: dark ? "text-slate-100" : "text-slate-900",
    muted: dark ? "text-slate-400" : "text-slate-500",
    btn: dark
      ? "bg-slate-800/40 border-slate-700 hover:bg-slate-700/60"
      : "bg-white border-slate-200 hover:bg-slate-50 hover:shadow-sm",
    popup: dark
      ? "bg-slate-900 border-slate-800 shadow-2xl"
      : "bg-white border-slate-200 shadow-xl",
    notifItem: dark ? "hover:bg-slate-800/60" : "hover:bg-slate-50",
    divider: dark ? "border-slate-800" : "border-slate-100",
  };
  return (
    <h1 className={`text-xl font-bold tracking-tight ${theme.text}`}>
      {title}
    </h1>
  );
}

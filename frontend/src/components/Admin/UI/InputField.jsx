
/**
 * A reusable, themed input field for the Admin Profile.
 * Supports dark mode, disabled states, and standard HTML input types.
 */
export default function InputField({
  label,
  value,
  onChange,
  type = "text",
  dark,
  disabled = false,
  placeholder = "",
}) {
  return (
    <div className="w-full">
      <label
        className={`block text-[10px] font-bold uppercase tracking-widest mb-2 ${
          "text-slate-600 dark:text-slate-400"
        }`}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all ${
          disabled
            ? dark
              ? "bg-slate-800/40 border-slate-800 text-slate-600 dark:text-slate-400 cursor-not-allowed"
              : "bg-slate-100 border-slate-200 text-slate-600 dark:text-slate-400 cursor-not-allowed"
            : dark
              ? "bg-slate-950 border-slate-700 text-white focus:border-cyan-500"
              : "bg-white border-slate-200 text-slate-900 focus:border-cyan-500"
        }`}
      />
    </div>
  );
}

/**
 * Specifically for longer text like the Clinic Bio.
 */
export function TextAreaField({
  label,
  value,
  onChange,
  dark,
  disabled = false,
  rows = 3,
}) {
  return (
    <div className="w-full">
      {label && (
        <label
          className={`block text-[10px] font-bold uppercase tracking-widest mb-2 ${
            "text-slate-600 dark:text-slate-400"
          }`}
        >
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        disabled={disabled}
        rows={rows}
        className={`w-full px-4 py-3 rounded-xl border text-sm outline-none resize-none transition-all ${
          disabled
            ? dark
              ? "bg-transparent border-transparent text-slate-600 dark:text-slate-400 cursor-default p-0" 
              : "bg-transparent border-transparent text-slate-600 dark:text-slate-400 cursor-default p-0"
            : dark
              ? "bg-slate-950 border-slate-700 text-slate-200 focus:border-cyan-500"
              : "bg-white border-slate-200 text-slate-700 dark:text-slate-300 focus:border-cyan-500"
        }`}
      />
    </div>
  );
}
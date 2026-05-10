import React from "react";
import { Clock } from "lucide-react";

export default function TabActivity({ logs, dark }) {
  return (
    <div
      className={`rounded-3xl border overflow-hidden ${dark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
    >
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className={dark ? "bg-slate-800/50" : "bg-slate-50"}>
            <th
              className={`p-4 text-xs font-bold uppercase ${dark ? "text-slate-500" : "text-slate-400"}`}
            >
              Activity
            </th>
            <th
              className={`p-4 text-xs font-bold uppercase ${dark ? "text-slate-500" : "text-slate-400"}`}
            >
              Device
            </th>
            <th
              className={`p-4 text-xs font-bold uppercase ${dark ? "text-slate-500" : "text-slate-400"}`}
            >
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-slate-800 divide-slate-100">
          {logs.map((log, idx) => (
            <tr
              key={idx}
              className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
            >
              <td
                className={`p-4 text-sm font-medium ${dark ? "text-slate-200" : "text-slate-700"}`}
              >
                {log.action}
              </td>
              <td
                className={`p-4 text-sm ${dark ? "text-slate-500" : "text-slate-500"}`}
              >
                {log.device}
              </td>
              <td
                className={`p-4 text-sm ${dark ? "text-slate-500" : "text-slate-500"}`}
              >
                <div className="flex items-center">
                  <Clock size={14} className="mr-2" />
                  {log.time}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

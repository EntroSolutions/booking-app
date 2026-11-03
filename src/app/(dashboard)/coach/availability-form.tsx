"use client";

import { useActionState, useState } from "react";
import { updateAvailability, type AvailabilityActionState } from "./actions";
import { WEEKDAYS } from "@/lib/scheduling/types";

type Row = { weekday: (typeof WEEKDAYS)[number]; startMinute: number; endMinute: number };
type Exception = { date: string; isUnavailable: boolean; startMinute: number | null; endMinute: number | null; reason: string };
type Props = { timezone: string; duration: number; weekly: Row[]; exceptions: Exception[] };
const initial: AvailabilityActionState = { ok: false };
const labels = WEEKDAYS.map((day) => ({ day, label: day[0] + day.slice(1).toLowerCase() }));
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromTime = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };

export default function AvailabilityForm({ timezone, duration, weekly: initialWeekly, exceptions: initialExceptions }: Props) {
  const [weekly, setWeekly] = useState(initialWeekly);
  const [zone, setZone] = useState(timezone);
  const [minutes, setMinutes] = useState(duration);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [state, action, pending] = useActionState(updateAvailability, initial);
  const update = (i: number, key: "startMinute" | "endMinute", value: string) => setWeekly(rows => rows.map((r, n) => n === i ? { ...r, [key]: fromTime(value) } : r));
  return <form action={action} className="space-y-8" aria-describedby="save-status">
    <input type="hidden" name="availability" value={JSON.stringify({ timezone, sessionDurationMinutes: minutes, weekly, exceptions })} readOnly />
    <section aria-labelledby="weekly-heading"><h2 id="weekly-heading" className="text-lg font-semibold">Weekly hours</h2><p className="text-sm text-gray-600">Times are in {zone}.</p>
      <div className="mt-3 space-y-3">{labels.map(({ day, label }) => <div key={day} className="rounded border p-3"><h3 className="font-medium">{label}</h3>
        {weekly.map((row, i) => row.weekday === day && <div className="mt-2 flex items-center gap-2" key={i}><label className="sr-only" htmlFor={`start-${i}`}>Start {label}</label><input id={`start-${i}`} type="time" value={toTime(row.startMinute)} onChange={e => update(i, "startMinute", e.target.value)} className="rounded border p-1" /><span>to</span><label className="sr-only" htmlFor={`end-${i}`}>End {label}</label><input id={`end-${i}`} type="time" value={toTime(row.endMinute)} onChange={e => update(i, "endMinute", e.target.value)} className="rounded border p-1" /><button type="button" className="text-sm underline" onClick={() => setWeekly(rows => rows.filter((_, n) => n !== i))}>Remove</button></div>)}
        <button type="button" className="mt-2 text-sm underline" onClick={() => setWeekly(rows => [...rows, { weekday: day, startMinute: 540, endMinute: 1020 }])}>Add interval</button>
      </div>)}</div>
    </section>
    <section aria-labelledby="exceptions-heading"><h2 id="exceptions-heading" className="text-lg font-semibold">Date-specific closures and overrides</h2><div className="mt-3 space-y-2">{exceptions.map((item, i) => <div className="flex flex-wrap items-center gap-2" key={i}><label className="sr-only" htmlFor={`date-${i}`}>Date</label><input id={`date-${i}`} type="date" value={item.date} onChange={e => setExceptions(xs => xs.map((x,n) => n===i ? {...x,date:e.target.value}:x))} className="rounded border p-1" /><select value={item.isUnavailable ? "closed" : "extra"} onChange={e => setExceptions(xs => xs.map((x,n) => n===i ? {...x,isUnavailable:e.target.value === "closed"}:x))} className="rounded border p-1"><option value="closed">Closed</option><option value="extra">Extra hours</option></select>{!item.isUnavailable && <><input aria-label="Override start" type="time" value={toTime(item.startMinute ?? 540)} onChange={e => setExceptions(xs => xs.map((x,n) => n===i ? {...x,startMinute:fromTime(e.target.value)}:x))} className="rounded border p-1" /><input aria-label="Override end" type="time" value={toTime(item.endMinute ?? 1020)} onChange={e => setExceptions(xs => xs.map((x,n) => n===i ? {...x,endMinute:fromTime(e.target.value)}:x))} className="rounded border p-1" /></>}<button type="button" className="text-sm underline" onClick={() => setExceptions(xs => xs.filter((_,n)=>n!==i))}>Remove</button></div>)}</div><button type="button" className="mt-2 text-sm underline" onClick={() => setExceptions(xs => [...xs,{date:"",isUnavailable:true,startMinute:null,endMinute:null,reason:""}])}>Add exception</button></section>
    <div><label htmlFor="timezone" className="block font-medium">Time zone</label><input id="timezone" value={zone} onChange={e => setZone(e.target.value)} className="mt-1 rounded border p-2" /><label htmlFor="duration" className="mt-3 block font-medium">Session duration (minutes)</label><input id="duration" type="number" min="1" max="480" value={minutes} onChange={e => setMinutes(Number(e.target.value))} className="mt-1 rounded border p-2" /></div>
    <div id="save-status" role="status" aria-live="polite" className={state.ok ? "text-green-700" : "text-red-700"}>{state.message}</div><button disabled={pending} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{pending ? "Saving…" : "Save availability"}</button>
  </form>;
}

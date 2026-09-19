import './_group.css';
import { ArrowRight, ShieldCheck } from 'lucide-react';

function Field({
  label,
  placeholder,
  value,
  wide = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-[11px] font-bold text-foreground ${wide ? 'sm:col-span-2' : ''}`}>
      {label}
      {wide ? (
        <textarea
          rows={4}
          value={value}
          readOnly
          className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground outline-none resize-none"
          aria-label={label}
        />
      ) : (
        <input
          type="text"
          value={value}
          readOnly
          placeholder={placeholder}
          className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground outline-none"
          aria-label={label}
        />
      )}
    </label>
  );
}

export function Current() {
  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:px-10">
      <div className="mx-auto max-w-[680px]">
        <div className="mb-8">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
            Direct enquiry
          </p>
          <h1 className="mb-3 text-[42px] leading-[0.95] tracking-tight text-foreground sm:text-[52px]">
            Ask about<br /><em>Jane.</em>
          </h1>
          <p className="max-w-[520px] text-[14px] leading-[1.6] text-muted-foreground">
            Jane is selected. For students under 18, please provide a parent or guardian&apos;s details.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
          <p className="text-[11px] leading-[1.5] text-muted-foreground">
            Fields marked with an asterisk are required. We will use these details only to respond to this enquiry.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Parent or guardian name *" placeholder="e.g. Eleanor James" value="Eleanor James" />
            <Field label="Email address *" placeholder="you@example.com" value="eleanor@example.com" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Student's name *" placeholder="First name" value="Sophie" />
            <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
              Student&apos;s age *
              <select className="appearance-none border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground outline-none" defaultValue="13-15" aria-label="Student's age">
                <option value="13-15">13–15</option>
              </select>
            </label>
          </div>

          <Field label="Subject and level *" placeholder="e.g. GCSE English Literature" value="GCSE English Literature" wide />
          <Field
            label="What would you like the tutor to know? *"
            placeholder="A little about what the student is working on..."
            value="Sophie would like more confidence with unseen poetry and essay structure before her mocks."
            wide
          />

          <button
            type="submit"
            className="mt-2 inline-flex items-center justify-center gap-2 bg-foreground px-6 py-4 text-[12px] font-bold text-background transition-colors hover:bg-primary"
          >
            Submit enquiry <ArrowRight size={15} />
          </button>

          <div className="mt-4 flex items-start gap-3 border-t border-border pt-4 text-[11px] leading-[1.5] text-muted-foreground">
            <ShieldCheck size={18} className="shrink-0 text-primary" />
            <p>
              Safeguarding note: enquiries for under-18s should come from a parent or guardian. Your details are shared securely and only for this enquiry and its record.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
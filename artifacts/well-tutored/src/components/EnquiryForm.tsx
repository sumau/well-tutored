import { useState } from "react";
import { useCreateEnquiry } from "@workspace/api-client-react";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import type { Tutor } from "@workspace/api-client-react";

interface EnquiryFormProps {
  tutor?: Tutor;
  tutors?: Tutor[];
  compact?: boolean;
}

export function EnquiryForm({ tutor, tutors = [], compact = false }: EnquiryFormProps) {
  const createEnquiry = useCreateEnquiry();
  const [success, setSuccess] = useState(false);
  const [submittedTutor, setSubmittedTutor] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    tutorSlug: tutor?.slug || "",
    studentName: "",
    studentAge: "",
    subjectLevel: "",
    message: ""
  });

  const update = (key: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const isComplete = Boolean(
    form.name.trim() && 
    form.email.trim() && 
    form.tutorSlug && 
    form.studentName.trim() && 
    form.studentAge &&
    form.subjectLevel.trim() &&
    form.message.trim().length >= 10
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isComplete || createEnquiry.isPending) return;
    setSubmitError("");

    const selectedTutorName = tutor?.name || tutors.find(t => t.slug === form.tutorSlug)?.name || form.tutorSlug;

    createEnquiry.mutate({
      data: form
    }, {
      onSuccess: () => {
        setSubmittedTutor(selectedTutorName);
        setSuccess(true);
        setForm({
          name: "",
          email: "",
          tutorSlug: tutor?.slug || "",
          studentName: "",
          studentAge: "",
          subjectLevel: "",
          message: ""
        });
      },
      onError: () => {
        setSubmitError("We could not record your enquiry. Please check the details and try again.");
      }
    });
  };

  if (success) {
    return (
      <div className={`text-center py-10 px-4 ${compact ? 'bg-card' : ''}`} data-testid="enquiry-success">
        <div className="w-[50px] h-[50px] bg-accent text-accent-foreground rounded-full flex items-center justify-center mx-auto mb-6">
          <Check size={24} />
        </div>
        <span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-primary mb-3">
          Message received
        </span>
        <h2 className="font-serif text-[32px] md:text-[40px] leading-[1.1] tracking-tight mb-4">
          Safely received<br /><em>for {submittedTutor}.</em>
        </h2>
        <p className="text-muted-foreground text-[14px] leading-[1.6] max-w-[320px] mx-auto mb-8">
          Well Tutored has securely recorded your enquiry. Email delivery is not yet enabled in this development version.
        </p>
        <button 
          onClick={() => setSuccess(false)}
          className="bg-foreground text-background text-[12px] font-bold px-6 py-3.5 hover:bg-primary transition-colors inline-flex items-center justify-center gap-2"
          data-testid="enquiry-reset"
        >
          Send another enquiry <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'bg-card p-8' : ''}`} id="enquire" data-testid="enquiry-form-container">
      {compact ? (
        <div className="mb-6">
          <h3 className="font-serif text-[28px] md:text-[32px] tracking-tight mb-2 text-foreground">Make a direct enquiry</h3>
          <p className="text-muted-foreground text-[13px] leading-[1.5]">
            {tutor
              ? "We’ll record your enquiry securely and keep your details private."
              : "Tell us which tutor you are interested in. We’ll record your enquiry securely and keep your details private."}
          </p>
        </div>
      ) : (
        <div className="mb-8">
          <h2 className="font-serif text-[38px] md:text-[48px] tracking-tight leading-[0.95] mb-3 text-foreground">
            Ask about<br /><em>{tutor ? tutor.name.split(' ')[0] : 'a tutor'}.</em>
          </h2>
          <p className="text-muted-foreground text-[14px] leading-[1.6]">
            {tutor ? `${tutor.name} is selected.` : 'Select a tutor.'} For students under 18, please provide a parent or guardian's details.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="enquiry-form">
        {/* Parent Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
            Parent or guardian name *
            <input 
              required
              className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors"
              placeholder="e.g. Eleanor James"
              value={form.name}
              onChange={e => update("name", e.target.value)}
              data-testid="input-parent-name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
            Email address *
            <input 
              required
              type="email"
              className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => update("email", e.target.value)}
              data-testid="input-parent-email"
            />
          </label>
        </div>

        {/* Tutor Selection (if not pre-selected) */}
        {!tutor && tutors.length > 0 && (
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
            Tutor you are interested in *
            <select
              required
              className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors appearance-none"
              value={form.tutorSlug}
              onChange={e => update("tutorSlug", e.target.value)}
              data-testid="input-tutor-select"
            >
              <option value="">Select a tutor</option>
              {tutors.map(t => (
                <option key={t.slug} value={t.slug}>{t.name} ({t.subject})</option>
              ))}
            </select>
          </label>
        )}

        {/* Student Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
            Student's name *
            <input 
              required
              className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors"
              placeholder="First name"
              value={form.studentName}
              onChange={e => update("studentName", e.target.value)}
              data-testid="input-student-name"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
            Student's age *
            <select
              required
              className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors appearance-none"
              value={form.studentAge}
              onChange={e => update("studentAge", e.target.value)}
              data-testid="input-student-age"
            >
              <option value="">Select</option>
              <option value="Under 13">Under 13</option>
              <option value="13-15">13–15</option>
              <option value="16-17">16–17</option>
              <option value="18+">18+</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
          Subject and level *
          <input 
            required
            className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors"
            placeholder="e.g. GCSE English Literature"
            value={form.subjectLevel}
            onChange={e => update("subjectLevel", e.target.value)}
            data-testid="input-subject-level"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-[11px] font-bold text-foreground">
          What would you like the tutor to know? *
          <textarea 
            required
            rows={4}
            className="border border-border bg-background px-3 py-3 text-[13px] font-normal text-foreground focus:border-primary outline-none transition-colors resize-none"
            placeholder="A little about what the student is working on, and what support might feel useful... (min 10 characters)"
            value={form.message}
            onChange={e => update("message", e.target.value)}
            data-testid="input-message"
          />
        </label>

        {submitError && (
          <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive" role="alert" data-testid="error-enquiry-submit">
            {submitError}
          </p>
        )}

        <button 
          type="submit"
          disabled={!isComplete || createEnquiry.isPending}
          className="mt-2 bg-foreground text-background text-[12px] font-bold px-6 py-4 hover:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="button-submit-enquiry"
        >
          {createEnquiry.isPending ? 'Submitting...' : 'Submit enquiry'} <ArrowRight size={15} />
        </button>

        <div className="mt-4 pt-4 border-t border-border flex items-start gap-3 text-[11px] text-muted-foreground leading-[1.5]">
          <ShieldCheck size={18} className="text-primary shrink-0" />
          <p>
            Safeguarding note: enquiries for under-18s should come from a parent or guardian. Your details are shared securely and only for this enquiry and its record.
          </p>
        </div>
      </form>
    </div>
  );
}

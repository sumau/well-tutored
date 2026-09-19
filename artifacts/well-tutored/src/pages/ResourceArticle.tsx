import { useParams, Link } from "wouter";
import { useGetResource, getGetResourceQueryKey, useListResources, getListResourcesQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, ArrowRight, Bookmark, Clock3, List, Printer, Share2 } from "lucide-react";
import { useState } from "react";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { useToast } from "@/hooks/use-toast";
import { EnquiryForm } from "@/components/EnquiryForm";
import { ResourceTypeLabel } from "@/components/ResourceType";

export default function ResourceArticle() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  
  const { data: article, isLoading, error, refetch } = useGetResource(slug as string, {
    query: { enabled: !!slug, queryKey: getGetResourceQueryKey(slug as string) }
  });

  const { data: allResources } = useListResources({ subject: article?.subject }, {
    query: { enabled: !!article, queryKey: getListResourcesQueryKey({ subject: article?.subject }) }
  });

  const related = allResources?.filter(r => r.slug !== slug).slice(0, 3) || [];

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link copied",
        description: "Article link copied to clipboard.",
      });
    } catch (e) {
      // Fallback
    }
  };

  const handleSave = () => {
    setSaved(!saved);
    toast({
      title: saved ? "Removed from saved" : "Saved to notes",
      description: saved ? "Article removed from your saved list." : "Article saved for later reading.",
    });
  };

  const jumpTo = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth" });
  };

  if (isLoading) return <LoadingState message="Loading article..." />;
  if (error || !article) return <ErrorState message="Could not find this article." onRetry={refetch} />;

  return (
    <main className="flex-1" data-testid={`page-article-${article.slug}`}>
      <article className="max-w-[1150px] mx-auto px-6 md:px-[28px] pt-[42px] md:pt-[62px] pb-[80px] md:pb-[100px]">
        {/* Breadcrumb */}
        <div className="text-[11px] text-muted-foreground flex items-center gap-[7px] mb-[30px] md:mb-[45px] font-medium">
          <Link href="/" className="hover:text-primary transition-colors">Home</Link>
          <span>/</span>
          <Link href="/resources" className="hover:text-primary transition-colors">Resources</Link>
          <span>/</span>
          <span className="text-foreground">{article.subject}</span>
        </div>

        {/* Hero */}
        <header className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_285px] gap-[40px] md:gap-[75px] items-end pb-[40px] md:pb-[58px] border-b border-border">
          <div>
            <h1 className="font-serif text-[clamp(48px,7vw,88px)] leading-[0.92] tracking-tight mb-[24px] max-w-[850px] text-foreground">
              {article.title}
            </h1>
            <p className="text-[16px] leading-[1.65] text-muted-foreground max-w-[670px] m-0">
              {article.excerpt}
            </p>
            <ResourceTypeLabel
              type={article.type}
              size={15}
              className="mt-6 text-[10px] uppercase tracking-[0.14em] text-primary font-bold"
            />
          </div>
          
          <div className="md:border-l border-border md:pl-[24px] pt-[20px] md:pt-0 border-t md:border-t-0 mt-[20px] md:mt-0 text-muted-foreground text-[12px] leading-[1.7]">
            <div className="flex items-center gap-[12px] mb-[22px] text-foreground font-bold">
              <span className="w-[43px] h-[43px] rounded-full grid place-items-center font-serif text-[18px] pb-1" style={{ backgroundColor: article.tutorTint }}>
                {article.tutorName.split(' ').map(n => n[0]).join('')}
              </span>
              <span>Written by {article.tutorName}</span>
            </div>
            <div className="flex gap-[7px] items-center mb-1"><Clock3 size={14} /> {article.readMinutes} min read</div>
            <div className="flex gap-[7px] items-center mb-1"><span className="font-semibold">For</span> {article.level}</div>
            
            <div className="flex gap-[9px] items-center flex-wrap my-[25px]">
              <button 
                onClick={handleSave}
                className={`border px-[13px] py-[11px] inline-flex items-center gap-[8px] text-[12px] font-medium transition-colors ${
                  saved ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground hover:bg-foreground hover:text-background"
                }`}
              >
                <Bookmark size={14} className={saved ? "fill-current" : ""} /> {saved ? "Saved" : "Save"}
              </button>
              <button 
                onClick={handleShare}
                className="border border-border px-[13px] py-[11px] inline-flex items-center gap-[8px] text-[12px] font-medium hover:border-foreground hover:bg-foreground hover:text-background transition-colors"
              >
                <Share2 size={14} /> Share
              </button>
            </div>
            
            <div className="flex items-center gap-[9px] pt-[18px] border-t border-border text-[11px] flex-wrap">
              <button onClick={() => window.print()} className="inline-flex items-center gap-[6px] hover:text-primary transition-colors">
                <Printer size={13} /> Print or save PDF
              </button>
            </div>
          </div>
        </header>

        {/* Content & Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-[60px] lg:gap-[82px] pt-[45px] lg:pt-[65px] lg:pl-[60px] lg:pr-[40px]">
          
          <div className="max-w-[660px] text-[16px] leading-[1.8] text-foreground">
            {article.sections.length > 0 && (
              <nav className="bg-card p-[22px] mb-[40px] border-l-4 border-primary shadow-sm" aria-label="In this guide">
                <h3 className="font-serif text-[21px] mb-[12px] flex items-center gap-2"><List size={15} className="text-primary"/> In this guide</h3>
                <div className="flex flex-col gap-2.5">
                  {article.sections.map((section, idx) => (
                    <button 
                      key={section.id} 
                      onClick={() => jumpTo(section.id)} 
                      className="text-left text-muted-foreground text-[13px] hover:text-primary transition-colors font-medium"
                    >
                      {idx + 1}. {section.heading}
                    </button>
                  ))}
                </div>
              </nav>
            )}

            <p className="mb-[25px] leading-[1.8] text-foreground">
              {article.body}
            </p>

            {article.sections.map(section => (
              <div key={section.id} id={`section-${section.id}`} className="mt-[48px] scroll-mt-24">
                <h2 className="font-serif text-[32px] md:text-[36px] leading-[1.1] tracking-tight mb-[20px] text-foreground">
                  {section.heading}
                </h2>
                <p className="mb-[25px] leading-[1.8] text-foreground">
                  {section.body}
                </p>
              </div>
            ))}

            <div className="flex gap-[12px] flex-wrap mt-[60px] pt-[30px] border-t border-border">
              <Link 
                href={`/tutors/${article.tutorSlug}`}
                className="bg-foreground text-background px-[16px] py-[14px] inline-flex items-center gap-[8px] text-[13px] font-bold hover:bg-primary transition-colors"
              >
                View {article.tutorName.split(' ')[0]}'s profile <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          
          <aside className="lg:self-start flex flex-col gap-[18px]">
            <div className="p-[25px]" style={{ backgroundColor: article.tutorTint }}>
              <span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-primary mb-2">Meet the author</span>
              <h3 className="font-serif text-[26px] leading-[1.05] tracking-tight mb-[12px]">{article.tutorName}</h3>
              <p className="text-[13px] leading-[1.6] text-foreground/80 mb-[22px]">
                Connect with {article.tutorName.split(' ')[0]} to discuss tailored support for {article.subject}.
              </p>
              <Link 
                href={`/tutors/${article.tutorSlug}`}
                className="bg-foreground text-background px-[15px] py-[13px] inline-flex items-center gap-[8px] text-[12px] font-bold hover:bg-primary transition-colors w-full justify-center"
              >
                View full profile <ArrowRight size={14} />
              </Link>
            </div>
            
            <div className="bg-accent p-[25px]">
              <h3 className="font-serif text-[22px] mb-[11px] leading-tight">A useful reminder</h3>
              <p className="text-[12px] leading-[1.6] text-accent-foreground/80 m-0">
                This note is a starting point, not a substitute for individual teaching. Keep what helps, try it once, and return with questions.
              </p>
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <section className="border-t border-border mt-[75px] pt-[45px]">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-[30px]">
              <div>
                <span className="block uppercase tracking-[0.17em] text-[10px] font-bold text-primary mb-2">Keep reading</span>
                <h2 className="font-serif text-[36px] md:text-[42px] leading-[0.95] tracking-tight m-0">
                  More resources
                </h2>
              </div>
              <Link href="/resources" className="text-[12px] font-bold flex items-center gap-2 border-b border-foreground pb-1 hover:text-primary hover:border-primary transition-colors">
                All resources <ArrowRight size={14} />
              </Link>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[14px]">
              {related.map(item => (
                <Link href={`/resources/${item.slug}`} key={item.id} className="text-left bg-card p-[25px] min-h-[175px] hover:bg-secondary transition-colors border border-transparent hover:border-border block">
                   <div className="flex items-center gap-1.5 text-primary text-[10px] uppercase tracking-[0.12em] font-bold mb-3">
                     <ResourceTypeLabel type={item.type} />
                     <span>· {item.subject}</span>
                   </div>
                  <h3 className="font-serif text-[23px] leading-[1.05] tracking-tight mb-[22px] text-foreground">{item.title}</h3>
                  <span className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5"><Clock3 size={12}/> {item.readMinutes} min read</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>

      <section className="bg-foreground text-background py-[80px] px-6 md:px-[30px]">
        <div className="max-w-[700px] mx-auto text-center">
          <h2 className="font-serif text-[38px] md:text-[48px] tracking-tight mb-6">Need more than a note?</h2>
          <p className="text-[#CEC1B4] text-[15px] leading-[1.65] mb-10 max-w-[500px] mx-auto">
            Our tutors are ready to help you apply these ideas to your own work. Enquire directly to set up a first session.
          </p>
          <div className="bg-background text-foreground text-left max-w-[600px] mx-auto shadow-2xl rounded-sm">
             <EnquiryForm compact={true} tutors={[{
               slug: article.tutorSlug,
               name: article.tutorName,
               subject: article.subject
             } as any]} />
          </div>
        </div>
      </section>
    </main>
  );
}

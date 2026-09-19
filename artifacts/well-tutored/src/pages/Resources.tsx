import { useMemo, useState } from "react";
import { useListResources } from "@workspace/api-client-react";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { ResourceCard } from "@/components/ResourceCard";

const FILTERS = [
  "All resources",
  "English",
  "Maths",
  "Science",
  "Parent resources",
  "Study habits",
];

export default function Resources() {
  const [filter, setFilter] = useState("All resources");
  const [query, setQuery] = useState("");

  const { data: resources, isLoading, error, refetch } = useListResources();

  const visible = useMemo(() => {
    if (!resources) return [];

    return resources.filter((resource) => {
      const matchesFilter =
        filter === "All resources" ||
        resource.subject === filter ||
        (filter === "Science" &&
          ["Biology", "Physics", "Chemistry"].includes(resource.subject));
      const matchesQuery = `${resource.title} ${resource.tutorName} ${resource.subject} ${resource.excerpt}`
        .toLowerCase()
        .includes(query.toLowerCase());

      return matchesFilter && matchesQuery;
    });
  }, [resources, filter, query]);

  if (isLoading) return <LoadingState message="Loading resources..." />;
  if (error) {
    return (
      <ErrorState
        message="Could not load the resources."
        onRetry={refetch}
      />
    );
  }

  return (
    <main className="flex-1" data-testid="page-resources">
      <header className="max-w-[1210px] mx-auto px-6 md:px-[30px] pt-[50px] md:pt-[75px] pb-[45px] md:pb-[66px] grid grid-cols-1 md:grid-cols-[1fr_330px] gap-[40px] md:gap-[70px] items-end">
        <div>
          <span
            className="block uppercase tracking-[0.18em] text-[10px] font-bold text-primary mb-4"
            data-testid="resources-kicker"
          >
            Insights and resources
          </span>
          <h1
            className="font-serif text-[clamp(53px,7vw,94px)] leading-[0.88] tracking-tight mb-[22px]"
            data-testid="resources-title"
          >
            Useful things,
            <br />
            <em>in their own words.</em>
          </h1>
          <p className="max-w-[590px] m-0 text-muted-foreground text-[15px] leading-[1.65]">
            Practical resources and small ideas from the women behind Well
            Tutored. Written for female secondary and A-level students, and
            the people supporting them.
          </p>
        </div>
        <aside className="bg-secondary p-[26px] rotate-2 shadow-sm border border-border/50 hidden md:block">
          <span className="block text-[10px] font-bold tracking-[0.16em] uppercase text-primary mb-[22px]">
            A thought from Maya
          </span>
          <b className="block font-serif text-[28px] leading-[0.97] tracking-tight text-foreground">
            Start with the question, not the perfect sentence.
          </b>
          <small className="block text-[11px] text-muted-foreground leading-[1.5] mt-[17px] font-medium">
            Good writing often begins before the words do.
          </small>
        </aside>
      </header>

      <section
        className="border-y border-border px-6 md:px-[30px] py-[20px]"
        aria-label="Filter tutor resources"
      >
        <div className="max-w-[1150px] mx-auto flex flex-col md:flex-row justify-between gap-[22px] items-start md:items-center">
          <div
            className="flex gap-[7px] flex-wrap"
            role="group"
            aria-label="Filter by resource type"
          >
            {FILTERS.map((item) => (
              <button
                key={item}
                className={`border px-[12px] py-[9px] text-[11px] transition-colors font-medium ${
                  filter === item
                    ? "bg-foreground border-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground hover:bg-card"
                }`}
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                data-testid={`filter-${item}`}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-[9px] border-b border-foreground pb-2 w-full md:w-[190px]">
            <Search size={15} className="text-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resources"
              aria-label="Search resources"
              className="border-0 bg-transparent w-full text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
              data-testid="input-search"
            />
          </label>
        </div>
      </section>

      <section
        className="px-6 md:px-[30px] py-[50px] md:py-[80px]"
        aria-live="polite"
      >
        <div className="max-w-[1150px] mx-auto">
          {visible.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[15px] md:gap-[25px]">
              {visible.map((resource, index) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No resources found"
              message="Try adjusting your filter or search term to see more resources."
            />
          )}
        </div>
      </section>
    </main>
  );
}
import { APPROVED_TUTOR_ACCENTS } from "../lib/tutor-accents";

export function isPublishableResource(resource: {
  title: string;
  subject: string;
  level: string;
  type: string;
  excerpt: string;
  body: string;
  sections: Array<{ id: string; heading: string; body: string }>;
}) {
  return (
    resource.title.trim().length >= 3 &&
    resource.subject.trim().length >= 1 &&
    resource.level.trim().length >= 1 &&
    ["Study note", "Guide", "Essay", "Revision notes"].includes(resource.type) &&
    resource.excerpt.trim().length >= 10 &&
    resource.body.trim().length >= 20 &&
    resource.sections.every(
      (section) =>
        section.id.trim().length >= 1 &&
        section.heading.trim().length >= 2 &&
        section.body.trim().length >= 10,
    )
  );
}

export function isPublishableProfile(profile: {
  firstName: string;
  lastName: string;
  initials: string;
  subject: string;
  profileSummary: string;
  university: string;
  qualification: string;
  bio: string;
  style: string;
  teachingIntro: string;
  teachingPoints: Array<{ title: string; body: string }>;
  rate: number;
  availability: string;
  tint: string;
}) {
  return (
    profile.firstName.trim().length >= 1 &&
    profile.lastName.trim().length >= 1 &&
    profile.initials.trim().length >= 1 &&
    profile.initials.trim().length <= 4 &&
    profile.subject.trim().length >= 2 &&
    profile.profileSummary.trim().length <= 200 &&
    profile.university.trim().length >= 2 &&
    profile.qualification.trim().length >= 2 &&
    profile.bio.trim().length >= 20 &&
    profile.style.trim().length >= 2 &&
    profile.teachingIntro.trim().length >= 20 &&
    profile.teachingIntro.trim().length <= 200 &&
    profile.teachingPoints.length === 3 &&
    profile.teachingPoints.every(
      (point) =>
        point.title.trim().length >= 2 &&
        point.body.trim().length >= 10,
    ) &&
    profile.rate >= 0 &&
    ["accepting", "limited", "unavailable"].includes(profile.availability) &&
    APPROVED_TUTOR_ACCENTS.includes(
      profile.tint as (typeof APPROVED_TUTOR_ACCENTS)[number],
    )
  );
}
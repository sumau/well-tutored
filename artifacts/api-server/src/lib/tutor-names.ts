export function splitTutorName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function tutorNameFields(tutor: {
  name: string;
  firstName: string;
  lastName: string;
}) {
  const legacyParts = splitTutorName(tutor.name);
  const firstName = tutor.firstName || legacyParts.firstName;
  const lastName = tutor.lastName || legacyParts.lastName;

  return {
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || tutor.name,
  };
}
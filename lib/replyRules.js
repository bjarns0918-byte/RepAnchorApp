// Reply style + safety rules, kept free of any dependencies so they can be
// tested on their own. Used by the scheduler (real reviews), the preview, and
// the Claude prompts.

// Words that mean a review may involve health, safety, or legal risk. Reviews
// containing any of these are NEVER auto-posted - they wait for the owner,
// even at 4-5 stars (e.g. "great food but my daughter's allergy was ignored").
const SENSITIVE_PATTERN = new RegExp(
  "\\b(" +
    [
      "allerg\\w*", "anaphyla\\w*", "epipen", "celiac", "gluten",
      "food poison\\w*", "poisoned", "got sick", "made (?:me|us|him|her|them|my \\w+) sick", "vomit\\w*", "diarrhea", "nause\\w*",
      "hospital", "emergency room", "paramedic\\w*", "injur\\w*",
      "health (?:dept|department|inspector|inspection|code)", "board of health",
      "lawsuit", "lawyer", "attorney", "sue you", "sue us", "suing", "legal action",
      "police", "assault\\w*", "harass\\w*", "discriminat\\w*", "racis\\w*", "sexis\\w*",
      "cockroach\\w*", "roach\\w*", "rats?", "mice", "mouse", "maggot\\w*", "hair in", "bug in", "insect\\w*",
      "raw chicken", "undercooked"
    ].join("|") +
    ")\\b",
  "i"
);

export function isSensitiveReview(comment) {
  return SENSITIVE_PATTERN.test(comment || "");
}

// Decides whether a review's reply may be posted automatically.
//   - only 4-5 star reviews are ever eligible
//   - the owner can switch to "approve everything"
//   - anything sensitive is held no matter what
// Returns { auto: boolean, reason: null | "approve_all" | "sensitive" }
export function decideAutoPost(business, review) {
  const stars = review.starRating;
  if (stars !== "FOUR" && stars !== "FIVE") return { auto: false, reason: null };
  if (business.approvalMode === "all") return { auto: false, reason: "approve_all" };
  if (isSensitiveReview(review.comment)) return { auto: false, reason: "sensitive" };
  return { auto: true, reason: null };
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

// Normalizes whatever the settings form sent into safe, bounded values.
export function normalizeVoiceSettings(input = {}) {
  return {
    replySignOff: clean(input.replySignOff, 60),
    replyAlwaysUse: clean(input.replyAlwaysUse, 200),
    replyNeverUse: clean(input.replyNeverUse, 200),
    noCompensation: input.noCompensation !== false,
    approvalMode: input.approvalMode === "all" ? "all" : "auto"
  };
}

// Extra instructions appended to every reply-writing prompt.
export function buildVoiceInstructions(business) {
  const parts = [];
  const always = clean(business.replyAlwaysUse, 200);
  const never = clean(business.replyNeverUse, 200);
  if (always) parts.push(`Where it fits naturally, work in: ${always}.`);
  if (never) parts.push(`Never use these words or phrases: ${never}.`);
  if (business.noCompensation !== false) {
    parts.push(
      "Never offer or promise refunds, free items, discounts, gift cards, or any compensation, and never admit legal fault or liability. " +
        "Instead, apologize sincerely where appropriate and invite the reviewer to contact the owner directly."
    );
  }
  if (clean(business.replySignOff, 60)) {
    parts.push("Do not sign the reply yourself - a sign-off is added automatically afterward.");
  }
  return parts.length ? "\n\nOwner's style rules:\n- " + parts.join("\n- ") : "";
}

// Adds the owner's sign-off on its own line, unless the reply already ends with it.
export function applySignOff(text, business) {
  const signOff = clean(business.replySignOff, 60);
  const body = (text || "").trim();
  if (!signOff || !body) return body;
  if (body.toLowerCase().endsWith(signOff.toLowerCase())) return body;
  return `${body}\n\n${signOff}`;
}

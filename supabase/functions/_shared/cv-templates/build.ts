// build.ts — single CV docx orchestrator.
//
// One buildCV(cvData, config) function for both ATS-Optimized and Polished
// styles. The two styles share the same section structure, the same
// helpers, and the same anti-fab pipeline upstream — they diverge only on
// visual chrome (color, border rules, label case, header layout). Style is
// a flag passed through config, not a separate file.
//
// Why this design over per-style template files:
// - The empirical research is unambiguous that BOTH styles must be single-
//   column for ATS survival (EDLIGO 1,200-doc benchmark + Resume Optimizer
//   Pro 200-400 doc tests show 22-point parse-fidelity gap). Structural
//   differences would compromise the Polished version's ATS performance,
//   which is non-negotiable for the pilot.
// - The differences that DO exist (color, border rules, label case,
//   spacing) are 1-2 lines of conditional each. Splitting into two files
//   would duplicate the ~300 lines of structure for no benefit.
// - Single source of truth for section ordering — when we add per-section
//   logic later (per-section refinement, per-section regen) it lives in
//   one place.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from "https://esm.sh/docx@8.5.0";

import type { TemplateConfig, SectionKey } from './types.ts'

// docx unit reminders:
//   - font size in half-points (20 = 10pt, 26 = 13pt, 56 = 28pt)
//   - twips: 1 inch = 1440 twips, 1 mm ≈ 56.7 twips
//   - line: 240 = single, 252 = 1.05x, 276 = 1.15x, 288 = 1.2x
//
// 0.7" margins (research-backed default):
//   1440 * 0.7 = 1008 twips on each side.
const MARGIN_TWIPS = 1008

// A4 page width = 11906 twips. With 1008 left + 1008 right margins,
// usable width = 9890 twips. Right tab stop sits just inside the right
// margin so dates align flush right on the same line as titles.
const PAGE_WIDTH = 11906
const RIGHT_TAB = PAGE_WIDTH - 2 * MARGIN_TWIPS - 16

// Font sizes (half-points). Tuned to research-backed ranges:
// name 18-22pt, headers 14-16pt, body 10-12pt, dates 9-10pt.
const SIZE_NAME_ATS = 44       // 22pt
const SIZE_NAME_POLISHED = 52  // 26pt
const SIZE_SECTION_ATS = 24    // 12pt
const SIZE_SECTION_POLISHED = 28  // 14pt
const SIZE_BODY = 22           // 11pt
const SIZE_BULLET = 20         // 10pt
const SIZE_ENTRY_TITLE = 22    // 11pt
const SIZE_DATE = 20           // 10pt
const SIZE_CONTACT = 20        // 10pt
const SIZE_SUBTITLE = 24       // 12pt

const COLOR_BLACK = "000000"
const COLOR_MUTED = "555555"

// Spacing (twips, 1pt = 20 twips, 1.0 line = 240).
const SP_SECTION_BEFORE_ATS = 100
const SP_SECTION_BEFORE_POLISHED = 200
const SP_SECTION_AFTER = 60
const SP_ENTRY_BEFORE = 80
const SP_BULLET_AFTER = 20
const LINE_SINGLE = 240
const LINE_BODY = 252  // 1.05x for prose paragraphs (About)

interface CvData {
  header?: { name?: string; subtitle?: string; phone?: string; email?: string; location?: string; linkedin?: string }
  summary?: string
  about_me?: string
  professional_experiences?: any[]
  experiences?: any[]
  military_experiences?: any[]
  military_service?: any
  volunteering_experiences?: any[]
  volunteering?: any[]
  leadership_experiences?: any[]
  education?: any[]
  skills?: { domain?: string[]; tools?: string[]; technical?: string[]; languages?: string[] }
  languages?: any[]
  honors_and_awards?: any[]
  certifications?: any[]
  projects?: any[]
}

interface UserContext {
  full_name?: string
  phone_number?: string
  email?: string
  location?: string
  linkedin_url?: string
  secondary_education?: { institution?: string; dates?: string; location?: string; highlights?: string[] }
}

const safeArray = (val: unknown): unknown[] => Array.isArray(val) ? val : []

export async function buildCV(
  cvData: CvData,
  userContext: UserContext,
  config: TemplateConfig,
): Promise<Uint8Array> {
  const polished = config.style === 'polished'
  const font = config.theme.font
  const accent = config.theme.accentHex
  const sizeName = polished ? SIZE_NAME_POLISHED : SIZE_NAME_ATS
  const sizeSection = polished ? SIZE_SECTION_POLISHED : SIZE_SECTION_ATS
  const sectionBefore = polished ? SP_SECTION_BEFORE_POLISHED : SP_SECTION_BEFORE_ATS

  const paragraphs: Array<Paragraph | Table> = []

  // ---------- Section helpers ----------

  const sectionHeading = (label: string): Paragraph => {
    const text = polished ? toTitleCase(label) : label.toUpperCase()
    return new Paragraph({
      spacing: { before: sectionBefore, after: SP_SECTION_AFTER },
      // ATS-Optimized: no bottom border (cleanest possible parse signal).
      // Polished: thin accent rule for visual hierarchy. Both safe for ATS.
      ...(polished
        ? { border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 8, space: 2 } } }
        : {}),
      children: [new TextRun({
        text,
        bold: true,
        size: sizeSection,
        font,
        color: polished ? accent : COLOR_BLACK,
      })],
    })
  }

  const subsectionHeading = (label: string): Paragraph => new Paragraph({
    spacing: { before: SP_ENTRY_BEFORE, after: 0 },
    children: [new TextRun({ text: label, bold: true, size: SIZE_BULLET, font })],
  })

  // Experience-style entry: "Role, Organization" bold left, dates muted right.
  const experienceEntryLine = (
    title: string, org: string | undefined, dates: string | undefined, withGap: boolean,
  ): Paragraph => {
    const titleText = String(title || "").trim()
    const orgText = String(org || "").trim()
    const combined = orgText ? `${titleText}, ${orgText}` : titleText
    const children: TextRun[] = [
      new TextRun({ text: combined, bold: true, size: SIZE_ENTRY_TITLE, font }),
    ]
    if (dates && String(dates).trim()) {
      children.push(new TextRun({ text: "\t", size: SIZE_ENTRY_TITLE }))
      children.push(new TextRun({
        text: String(dates).trim(),
        size: SIZE_DATE,
        color: COLOR_MUTED,
        font,
      }))
    }
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      spacing: { before: withGap ? SP_ENTRY_BEFORE : 0, after: 0 },
      children,
    })
  }

  // Education-style entry: bold degree (or institution if no degree) + dates,
  // institution / location on line 2.
  const educationEntryLines = (
    title: string, subtitle: string | undefined, dates: string | undefined, withGap: boolean,
  ): Paragraph[] => {
    const out: Paragraph[] = []
    const titleChildren: TextRun[] = [
      new TextRun({ text: String(title || "").trim(), bold: true, size: SIZE_ENTRY_TITLE, font }),
    ]
    if (dates && String(dates).trim()) {
      titleChildren.push(new TextRun({ text: "\t", size: SIZE_ENTRY_TITLE }))
      titleChildren.push(new TextRun({
        text: String(dates).trim(),
        size: SIZE_DATE,
        color: COLOR_MUTED,
        font,
      }))
    }
    out.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
      spacing: { before: withGap ? SP_ENTRY_BEFORE : 0, after: 0 },
      children: titleChildren,
    }))
    const subText = String(subtitle || "").trim()
    if (subText) {
      out.push(new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: subText, size: SIZE_BULLET, color: COLOR_MUTED, font })],
      }))
    }
    return out
  }

  const bulletParagraph = (s: string): Paragraph => new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 0, after: SP_BULLET_AFTER, line: LINE_SINGLE },
    children: [new TextRun({ text: String(s || ""), size: SIZE_BULLET, font })],
  })

  const bodyParagraph = (s: string): Paragraph => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 0, after: SP_BULLET_AFTER, line: LINE_BODY },
    children: [new TextRun({ text: String(s || ""), size: SIZE_BODY, font })],
  })

  const labelledLine = (label: string, items: string[]): Paragraph | null => {
    const valueText = (items || []).map(s => String(s).trim()).filter(Boolean).join(", ")
    if (!valueText) return null
    return new Paragraph({
      spacing: { before: 0, after: SP_BULLET_AFTER, line: LINE_SINGLE },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: SIZE_BULLET, font }),
        new TextRun({ text: valueText, size: SIZE_BULLET, font }),
      ],
    })
  }

  const plainLine = (s: string): Paragraph => new Paragraph({
    spacing: { before: 0, after: SP_BULLET_AFTER, line: LINE_SINGLE },
    children: [new TextRun({ text: s, size: SIZE_BULLET, font })],
  })

  // ---------- Header ----------

  const header = cvData.header || {}
  const nameText = String(header.name || userContext.full_name || "").toUpperCase()
  const subtitleText = String(header.subtitle || "").trim()

  const contactBits: string[] = []
  const pushBit = (v: string | null | undefined) => {
    const s = (v ?? "").toString().trim()
    if (s) contactBits.push(s)
  }
  pushBit(header.phone || userContext.phone_number)
  pushBit(header.email || userContext.email)
  pushBit(header.location || userContext.location)
  pushBit(header.linkedin || userContext.linkedin_url)

  // Polished + photo: 2-cell table at the top. Cell 1 = name + subtitle +
  // contact. Cell 2 = image. Even when ATS scrambles columns into linear
  // text, the worst case is photo bytes appearing AFTER text — name and
  // contact still parse correctly. Without a photo, fall through to the
  // single-column header.
  if (polished && config.photo) {
    paragraphs.push(buildPhotoHeaderTable(
      nameText, subtitleText, contactBits, config.photo, font, accent, sizeName,
    ))
  } else {
    // Single-column header: name centered for both styles. Earlier Polished
    // version was left-aligned for a "modernized" look, but Eli's testing
    // showed it competed with the centered accent rule visually. Centering
    // both keeps the same posture across styles and matches CDO templates.
    const headerAlign = AlignmentType.CENTER
    paragraphs.push(new Paragraph({
      alignment: headerAlign,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({
        text: nameText,
        bold: true,
        size: sizeName,
        font,
        color: polished ? accent : COLOR_BLACK,
      })],
    }))
    // Polished: thin accent rule under the name. ATS-Optimized: no rule.
    if (polished) {
      paragraphs.push(new Paragraph({
        spacing: { before: 20, after: 80 },
        border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 12, space: 1 } },
        children: [new TextRun({ text: "", size: 1 })],
      }))
    }
    if (subtitleText) {
      paragraphs.push(new Paragraph({
        alignment: headerAlign,
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: subtitleText, size: SIZE_SUBTITLE, color: COLOR_MUTED, font })],
      }))
    }
    if (contactBits.length > 0) {
      paragraphs.push(new Paragraph({
        alignment: headerAlign,
        spacing: { before: 0, after: 120 },
        children: [new TextRun({
          text: contactBits.join("  \u00B7  "),
          size: SIZE_CONTACT,
          font,
        })],
      }))
    }
  }

  // ---------- Sections ----------

  const renderers: Record<SectionKey, () => void> = {
    about: () => renderAbout(cvData, paragraphs, sectionHeading, bodyParagraph),
    experience: () => renderExperience(cvData, paragraphs, sectionHeading, subsectionHeading, experienceEntryLine, bulletParagraph),
    education: () => renderEducation(cvData, userContext, paragraphs, sectionHeading, educationEntryLines, bulletParagraph),
    skills: () => renderSkills(cvData, paragraphs, sectionHeading, labelledLine),
    languages: () => renderLanguages(cvData, paragraphs, sectionHeading, plainLine),
    honors: () => renderHonors(cvData, paragraphs, sectionHeading, bulletParagraph),
    certifications: () => renderCertifications(cvData, paragraphs, sectionHeading, bulletParagraph),
    projects: () => renderProjects(cvData, paragraphs, sectionHeading, experienceEntryLine, bulletParagraph),
  }
  for (const sectionKey of config.sectionOrder) {
    renderers[sectionKey]?.()
  }

  // ---------- Document assembly ----------

  const docFile = new Document({
    styles: {
      default: { document: { run: { font, size: SIZE_BODY } } },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: MARGIN_TWIPS,
            bottom: MARGIN_TWIPS,
            left: MARGIN_TWIPS,
            right: MARGIN_TWIPS,
          },
        },
      },
      children: paragraphs,
    }],
  })

  const docBase64 = await Packer.toBase64String(docFile)
  return Uint8Array.from(atob(docBase64), c => c.charCodeAt(0))
}

// ---------- Section renderers ----------

function renderAbout(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  bodyParagraph: (s: string) => Paragraph,
): void {
  const aboutText = String(cvData.summary || cvData.about_me || "").trim()
  if (!aboutText) return
  paragraphs.push(sectionHeading("About Me"))
  paragraphs.push(bodyParagraph(aboutText))
}

function renderExperience(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  subsectionHeading: (label: string) => Paragraph,
  experienceEntryLine: (title: string, org: string | undefined, dates: string | undefined, withGap: boolean) => Paragraph,
  bulletParagraph: (s: string) => Paragraph,
): void {
  const professional = Array.isArray(cvData.professional_experiences)
    ? cvData.professional_experiences
    : (Array.isArray(cvData.experiences) ? cvData.experiences : [])
  const military = Array.isArray(cvData.military_experiences)
    ? cvData.military_experiences
    : (cvData.military_service && (cvData.military_service as any).unit ? [cvData.military_service] : [])
  const volunteering = Array.isArray(cvData.volunteering_experiences)
    ? cvData.volunteering_experiences
    : (Array.isArray(cvData.volunteering) ? cvData.volunteering : [])
  const leadership = Array.isArray(cvData.leadership_experiences) ? cvData.leadership_experiences : []

  if (professional.length + military.length + volunteering.length + leadership.length === 0) return

  paragraphs.push(sectionHeading("Experience"))
  const renderBlock = (entries: any[], orgKey: string) => {
    entries.forEach((exp, idx) => {
      paragraphs.push(experienceEntryLine(exp.title || "", exp[orgKey], exp.dates, idx > 0))
      ;(exp.bullets || []).forEach((b: string) => paragraphs.push(bulletParagraph(b)))
    })
  }
  if (professional.length > 0) {
    paragraphs.push(subsectionHeading("Professional Experience"))
    renderBlock(professional, "company")
  }
  if (military.length > 0) {
    paragraphs.push(subsectionHeading("Military Service"))
    renderBlock(military, "unit")
  }
  if (volunteering.length > 0) {
    paragraphs.push(subsectionHeading("Volunteering"))
    renderBlock(volunteering, "organization")
  }
  if (leadership.length > 0) {
    paragraphs.push(subsectionHeading("Leadership"))
    renderBlock(leadership, "organization")
  }
}

function renderEducation(
  cvData: CvData,
  userContext: UserContext,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  educationEntryLines: (title: string, subtitle: string | undefined, dates: string | undefined, withGap: boolean) => Paragraph[],
  bulletParagraph: (s: string) => Paragraph,
): void {
  const llmEducation = Array.isArray(cvData.education) ? cvData.education : []
  const secondary = userContext.secondary_education
  const normInst = (s: unknown) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase()
  const merged = [...llmEducation]
  if (secondary?.institution) {
    const already = merged.some(e => normInst(e.institution) === normInst(secondary.institution))
    if (!already) {
      merged.push({
        institution: secondary.institution,
        degree: "",
        dates: secondary.dates,
        coursework: [],
        highlights: secondary.highlights || [],
        _secondary_location: secondary.location,
      })
    }
  }
  if (merged.length === 0) return

  paragraphs.push(sectionHeading("Education"))
  const honorsSet = new Set(
    safeArray(cvData.honors_and_awards)
      .map((h: any) => h && (typeof h === 'string' ? h : String(h.name || "").trim()))
      .map((s: any) => String(s).replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean),
  )

  merged.forEach((edu: any, idx) => {
    const topLine = edu.degree?.trim() ? edu.degree : edu.institution
    const subLine = edu.degree?.trim() ? edu.institution : (edu._secondary_location || "")
    educationEntryLines(topLine || "", subLine, edu.dates, idx > 0).forEach(p => paragraphs.push(p))
    if (edu.gpa) paragraphs.push(bulletParagraph(`GPA: ${edu.gpa}`))

    let coursework = safeArray(edu.coursework || edu.relevant_coursework).map(String)
    let activities = safeArray(edu.activities).map(String)
    if (coursework.length === 0 && activities.length === 0) {
      const loose = [...safeArray(edu.details), ...safeArray(edu.highlights)].map(String)
      for (const item of loose) {
        const t = item.trim()
        if (!t) continue
        if (t.length < 30 && !/[.!?:;]/.test(t) && !/\b(club|president|editor|captain|volunteer|led|managed|organized|mentor)\b/i.test(t)) {
          coursework.push(t)
        } else {
          activities.push(t)
        }
      }
    }
    if (coursework.length > 0) {
      paragraphs.push(bulletParagraph(`Relevant coursework: ${coursework.join(", ")}`))
    }
    const seen = new Set<string>()
    activities.forEach(a => {
      const raw = String(a || "").trim()
      if (!raw) return
      const key = raw.replace(/\s+/g, " ").toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      if (honorsSet.has(key)) return
      paragraphs.push(bulletParagraph(raw))
    })
  })
}

function renderSkills(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  labelledLine: (label: string, items: string[]) => Paragraph | null,
): void {
  const skills = cvData.skills || {}
  if (!(skills.domain?.length || skills.tools?.length || skills.technical?.length)) return
  paragraphs.push(sectionHeading("Skills & Tools"))
  if (skills.domain?.length) { const p = labelledLine("Domain", skills.domain); if (p) paragraphs.push(p) }
  if (skills.tools?.length) { const p = labelledLine("Tools", skills.tools); if (p) paragraphs.push(p) }
  if (skills.technical?.length) { const p = labelledLine("Technical", skills.technical); if (p) paragraphs.push(p) }
}

function renderLanguages(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  plainLine: (s: string) => Paragraph,
): void {
  let lines: string[] = []
  if (Array.isArray(cvData.languages)) {
    lines = cvData.languages.map((l: any) => {
      if (!l) return ""
      if (typeof l === "string") return l
      const lang = String(l.language || "").trim()
      const level = String(l.proficiency || l.level || "").trim()
      return lang && level ? `${lang} (${level})` : lang
    }).filter(s => s.length > 0)
  } else if (Array.isArray(cvData.skills?.languages)) {
    lines = cvData.skills!.languages!.map((s: any) => String(s)).filter(Boolean)
  }
  if (lines.length === 0) return
  paragraphs.push(sectionHeading("Languages"))
  paragraphs.push(plainLine(lines.join(", ")))
}

function renderHonors(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  bulletParagraph: (s: string) => Paragraph,
): void {
  const lines = safeArray(cvData.honors_and_awards).map((h: any) => {
    if (!h) return ""
    if (typeof h === "string") return h
    const name = String(h.name || "").trim()
    const desc = String(h.description || "").trim()
    return name && desc ? `${name} \u2014 ${desc}` : name
  }).filter(s => s.length > 0)
  if (lines.length === 0) return
  paragraphs.push(sectionHeading("Honors & Awards"))
  lines.forEach(h => paragraphs.push(bulletParagraph(h)))
}

function renderCertifications(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  bulletParagraph: (s: string) => Paragraph,
): void {
  const certs = Array.isArray(cvData.certifications) ? cvData.certifications : []
  if (certs.length === 0) return
  paragraphs.push(sectionHeading("Certifications"))
  certs.forEach((cert: any) => {
    const parts: string[] = []
    if (cert.name) parts.push(String(cert.name))
    if (cert.issuer) parts.push(String(cert.issuer))
    const line = parts.join(", ") + (cert.date ? `  (${cert.date})` : "")
    if (line.trim()) paragraphs.push(bulletParagraph(line))
  })
}

function renderProjects(
  cvData: CvData,
  paragraphs: Array<Paragraph | Table>,
  sectionHeading: (label: string) => Paragraph,
  experienceEntryLine: (title: string, org: string | undefined, dates: string | undefined, withGap: boolean) => Paragraph,
  bulletParagraph: (s: string) => Paragraph,
): void {
  const projects = Array.isArray(cvData.projects) ? cvData.projects : []
  if (projects.length === 0) return
  paragraphs.push(sectionHeading("Projects"))
  projects.forEach((proj: any, idx) => {
    paragraphs.push(experienceEntryLine(proj.name || "", undefined, undefined, idx > 0))
    ;(proj.bullets || []).forEach((b: string) => paragraphs.push(bulletParagraph(b)))
  })
}

// ---------- Photo header table (Polished + photo only) ----------

// Builds a 2-cell single-row table for the polished+photo header. Cell 1
// = name + subtitle + contact (left). Cell 2 = photo (right). The table
// is local to the header — it never wraps experience/education content,
// so the ATS column-flatten failure mode (worst case: contact + photo
// bytes parsed in reading order) is acceptable.
function buildPhotoHeaderTable(
  nameText: string, subtitleText: string, contactBits: string[],
  photo: { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' },
  font: string, accent: string, sizeName: number,
): Table {
  // Photo cell: ~100pt × 125pt (≈1"×1.25", passport-photo ratio).
  // ImageRun accepts Uint8Array directly; type discriminator picks PNG vs
  // JPEG. PR B adds the storage fetch + bytes loading; the buildCV signature
  // already accepts the loaded photo bytes here.
  const photoPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data: photo.bytes,
      transformation: { width: 100, height: 125 },
      type: photo.mime === 'image/png' ? 'png' : 'jpg',
    } as any)],
  })

  const headerLeftCell = new TableCell({
    width: { size: 75, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: nameText, bold: true, size: sizeName, font, color: accent })],
      }),
      new Paragraph({
        spacing: { before: 20, after: 80 },
        border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 12, space: 1 } },
        children: [new TextRun({ text: "", size: 1 })],
      }),
      ...(subtitleText ? [new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: subtitleText, size: SIZE_SUBTITLE, color: COLOR_MUTED, font })],
      })] : []),
      ...(contactBits.length ? [new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: contactBits.join("  \u00B7  "), size: SIZE_CONTACT, font })],
      })] : []),
    ],
  })

  const headerRightCell = new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    children: [photoPara],
  })

  return new Table({
    rows: [new TableRow({ children: [headerLeftCell, headerRightCell] })],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  })
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

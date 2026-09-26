/* Section B — AI-generated and AI-checked revision notes. */
import { def } from '../../core/registry.js';
import { fail } from '../../core/errors.js';
import { clamp, num } from '../../core/validators.js';
import { chapterGround, topicGround, BLOCK_SCHEMA_INSTRUCTIONS, clip } from '../../core/prompts.js';

def('notes.chapterPart', {
  title: 'One part of a chapter\'s AI notes (definition / worked example / tips / flashcards / per-subtopic)',
  // part: 'definition' | 'example' | 'tips' | 'flashcards' | 'subtopic' | 'subtopicFlashcards'
  tokens: (c) => ({ definition: 650, example: 550, tips: 480, flashcards: 600, subtopic: 550, subtopicFlashcards: 900 }[c.part] || 550),
  needs: ['part', 'subject', 'chapter'],
  build(c, p) {
    const g = chapterGround(c, p);
    const lvl = p.jee ? '' : `, ${c.level || 'Core'}`;
    const subj = c.subject, ch = c.chapter;
    const T = {
      definition: {
        system: p.jee
          ? `You are a JEE/NEET ${subj} teacher writing NCERT-grounded revision notes, similar in structure and concision to standard coaching-institute notes. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`
          : `You are a Cambridge IGCSE ${subj} teacher writing exam board style revision notes, similar in structure and concision to Save My Exams. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`,
        user: p.jee
          ? `For "${ch}" (${subj}), write the DEFINITION & KEY FACTS section: one clean definition sentence for the core concept (bold the key term), then key facts as tight bullet points (bold the important word in each, include key formulas where relevant). If this topic naturally compares 2+ things (e.g. types of bonding, categories of reactions), include a table comparing them.`
          : `For "${ch}" (${subj}${lvl}), write the DEFINITION & KEY FACTS section: one clean definition sentence for the core concept (bold the key term), then key facts as tight bullet points (bold the important word in each). If this topic naturally compares 2+ things (e.g. states of matter, types of bonding, categories of anything), include a table comparing them.`
      },
      example: {
        system: p.jee
          ? `You are a JEE/NEET ${subj} teacher creating a worked numerical/problem-solving example. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`
          : `You are a Cambridge IGCSE ${subj} teacher creating a worked exam-style example. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`,
        user: p.jee
          ? `For "${ch}" (${subj}), give ONE worked example as an "example" block — numerical/problem-solving where the chapter calls for it, at JEE/NEET exam difficulty (harder than a school-level example), phrased like a real JEE/NEET-style question. Show clearly the reasoning at each step. Use only formulas within the NCERT/JEE-NEET syllabus.`
          : `For "${ch}" (${subj}${lvl}), give ONE worked example as an "example" block, in Cambridge exam style, at IGCSE difficulty only, phrased like a real IGCSE exam question. Show clearly where exam marks are earned at each step. Use only formulas that appear on the IGCSE ${subj} syllabus.`
      },
      tips: {
        system: p.jee
          ? `You are a JEE/NEET expert sharing what students commonly get wrong on this exact topic. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`
          : `You are a Cambridge IGCSE examiner sharing what students commonly get wrong on this exact topic. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`,
        user: p.jee
          ? `For "${ch}" (${subj}), give a "mistake" block (wrong = a specific error students make on this exact topic, right = what's actually correct, why = a short explanation), plus a "keypoints" block labeled "EXAM TIPS" with 3 specific tips for maximising marks on this topic (including how it's commonly tested — MCQ trap options, numerical-answer precision, etc.). Be concrete and specific to this chapter's content, not generic exam advice.`
          : `For "${ch}" (${subj}${lvl}), give a "mistake" block (wrong = a specific error students make on this exact topic, right = what's actually correct, why = a short explanation), plus a "keypoints" block labeled "EXAMINER TIPS" with 3 specific tips for maximising marks on this topic. Be concrete and specific to this chapter's content, not generic exam advice.`
      },
      flashcards: {
        system: p.jee
          ? `You are creating exam-revision flashcards for JEE/NEET. ${g} Respond ONLY with valid JSON — no markdown fences, no text before or after.`
          : `You are creating exam-revision flashcards for Cambridge IGCSE. ${g} Respond ONLY with valid JSON — no markdown fences, no text before or after.`,
        user: p.jee
          ? `Create 5 flashcards for "${ch}" (${subj}). Mix definition recall, numerical application, and MCQ-style questions — JEE/NEET difficulty only.\nJSON format: {"cards":[{"q":"question","a":"concise answer"}]}`
          : `Create 5 flashcards for "${ch}" (${subj}, ${c.level || 'Core'}). Mix definition recall, application, and exam-style questions — IGCSE difficulty only.\nJSON format: {"cards":[{"q":"question","a":"concise answer"}]}`
      },
      // Subtopic mode (IGCSE chapters that map to syllabus subtopics): one call per subtopic + one for flashcards.
      subtopic: {
        system: `You are a Cambridge IGCSE ${subj} teacher writing exam-board revision notes in the style of Save My Exams: one focused sub-section at a time, clear and concise. ${g}${BLOCK_SCHEMA_INSTRUCTIONS}`,
        user: `Chapter: "${ch}" (${subj}, ${c.level || 'Core'}).\nWrite the revision-note section for EXACTLY ONE subtopic: "${c.subtopic}" — a one-sentence definition of the core idea, tight key points (bold the important word in each), and ONE short concrete example, comparison, or typical value/number that makes it click.\nDO NOT cover these other subtopics (they have their own sections): ${(c.allSubtopics || []).filter(x => x !== c.subtopic).join('; ') || 'none'}.\nDepth: revision depth, NOT textbook depth — the student learned this in school and is here to consolidate.`
      },
      subtopicFlashcards: {
        system: `You are a Cambridge IGCSE ${subj} teacher creating flashcards. ${g} Respond ONLY with valid JSON — no markdown fences, no text before or after.`,
        user: `Create 8 flashcards for "${ch}" (${subj}, ${c.level || 'Core'}) covering ALL these subtopics: ${(c.allSubtopics || []).join('; ')}.\nMix: definition recall, application, and exam-style. IGCSE difficulty only.\nJSON format: {"cards":[{"q":"question","a":"concise answer"}]}`
      }
    };
    const t = T[c.part];
    if (!t) throw fail('MISSING_INPUT', `notes.chapterPart: unknown part "${c.part}"`);
    return t;
  },
  validate(data, c, warnings) {
    if (c.part === 'flashcards' || c.part === 'subtopicFlashcards') {
      const cards = (Array.isArray(data.cards) ? data.cards : []).filter(x => x && x.q && x.a).slice(0, 10);
      if (cards.length < 5) throw fail('INVALID', `Only ${cards.length} valid flashcards came back (need 5+).`);
      return { cards };
    }
    if (!Array.isArray(data.blocks) || !data.blocks.length) throw fail('INVALID', 'The AI returned no note blocks.');
    return { blocks: data.blocks };
  }
});

def('notes.topic', {
  title: 'Notes for ONE topic inside a chapter', tokens: 700,
  needs: ['subject', 'chapter', 'topic'],
  build(c, p) {
    const g = topicGround(c, p);
    const system = (p.jee
      ? `You are a JEE/NEET ${c.subject} teacher writing NCERT-grounded revision notes, similar in structure and concision to standard coaching-institute notes. `
      : `You are a Cambridge IGCSE ${c.subject} teacher writing exam board style revision notes, similar in structure and concision to Save My Exams. `) + g + BLOCK_SCHEMA_INSTRUCTIONS;
    const user = `Chapter: "${c.chapter}" (${c.subject}${p.jee ? '' : ', ' + (c.level || 'Core')}).\nWrite the revision-note section for EXACTLY ONE topic: "${c.topic.name}"${c.topic.teaser ? ' — ' + c.topic.teaser : ''}. One clean definition/key-facts pass, then one short concrete example or comparison if it fits naturally. Depth: revision depth, not textbook depth — the student learned this in class and is here to consolidate.`;
    return { system, user };
  },
  validate(data) {
    if (!Array.isArray(data.blocks) || !data.blocks.length) throw fail('INVALID', 'The AI returned no note blocks.');
    return { blocks: data.blocks };
  }
});

const NOTES_REVIEW_JSON = '{"covered":["list of core concepts found"],"missing":[{"concept":"name of missing core concept","detail":"brief explanation of what this concept is"}],"score":0-100,"feedback":"one encouraging sentence"}';

def('notes.check', {
  title: "Check the student's typed notes for missing core concepts (study-session card)", tokens: 2000,
  needs: ['subject', 'topic', 'notes'],
  build(c, p) {
    return {
      system: `You are a friendly ${p.board} ${c.subject} teacher reviewing a student's notes for "${c.topic}".\n\nIMPORTANT RULES:\n- Only check for CORE CONCEPTS: key definitions, fundamental formulas, important principles, and essential theory.\n- Do NOT check for specific exam problems, worked examples, or practice questions — those are separate.\n- Be LENIENT: if the student shows understanding of a concept in their own words, mark it as covered even if the wording differs from the textbook.\n- If a concept is partially covered or implied, count it as covered.\n- Focus on the 5-8 most important concepts for this chapter, not every minor detail.\n\nRespond ONLY with JSON:\n${NOTES_REVIEW_JSON}`,
      user: `Student notes for ${c.subject} — ${c.topic}:\n\n${clip(c.notes, 3000)}`
    };
  },
  validate(data) { return { covered: data.covered || [], missing: data.missing || [], score: clamp(num(data.score, 0), 0, 100), feedback: data.feedback || '' }; }
});

def('notes.gapCheck', {
  title: "Check a chapter's notes for missing core concepts (chapter page button)", tokens: 1500,
  needs: ['subject', 'chapter', 'notes'],
  build(c, p) {
    return {
      system: `You are a friendly ${p.board} ${c.subject} teacher.\n\nCheck these notes for the chapter '${c.chapter}' (${c.level || 'Core'}).\n\nIMPORTANT: Only check for the 5-8 MOST IMPORTANT core concepts (key definitions, fundamental formulas, essential principles). Do NOT flag specific exam questions, worked examples, or minor details. Be lenient — if the concept is mentioned in any form, count it as covered.\n\nRespond ONLY with JSON:\n{"covered":["list"],"missing":[{"concept":"name","detail":"brief explanation"}],"score":0-100,"feedback":"one encouraging sentence"}`,
      user: `Notes to check:\n\n${clip(c.notes, 3000)}`
    };
  },
  validate(data) { return { covered: data.covered || [], missing: data.missing || [], score: clamp(num(data.score, 80), 0, 100), feedback: data.feedback || '' }; }
});

def('notes.missingParts', {
  title: 'Write notes ONLY for the concepts a gap check found missing', tokens: 2000, parse: 'text',
  needs: ['subject', 'chapter', 'missing'],
  build(c, p) {
    return {
      system: `You are ${p.aBoard} ${c.subject} teacher (${c.level || 'Core'}). Generate clear, concise study notes ONLY for the following missing concepts from the chapter '${c.chapter}'. Include key definitions, formulas, and exam-relevant explanations. Keep it focused and under 500 words.`,
      user: 'Generate notes for these missing concepts:\n\n' + c.missing.map(m => m.concept + ': ' + (m.detail || '')).join('\n')
    };
  }
});

def('notes.pdfCleanup', {
  title: 'Turn raw text pulled from a PDF into readable study notes', tokens: 2000, parse: 'text',
  needs: ['rawText'],
  // The app has two slightly different wordings (note editor vs notes upload). One is enough.
  build(c) {
    return {
      system: "You are a text cleanup assistant. The following text was extracted from a PDF and contains noise. Clean it up into readable study notes. Remove any PDF formatting artifacts, headers/footers, and page numbers. Keep all the actual educational content. Return ONLY the cleaned notes text.",
      user: "Raw extracted text:\n\n" + clip(c.rawText, 6000)
    };
  }
});

def('notes.image', { title: 'Illustration for chapter notes (Gemini gemini-2.5-flash-image)', tokens: 0, external: true, provider: 'gemini',
  where: 'Apex_v100.html generateNoteImage (raw Gemini call)',
  note: 'Prompt is built inline in generateChapterNotes after part 1: "<chapter> — <subject> <level>: illustrate the core concept described here: <first 300 chars of the part>".' });

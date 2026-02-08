import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const GROQ_MODEL = process.env.GROQ_MODEL_ID || "qwen/qwen3-32b";

/**
 * System prompts for different AI tasks
 */
export const PROMPTS = {
  DOCUMENT_SUMMARY: {
    system: `You are an expert academic assistant specializing in creating comprehensive, well-structured summaries of educational materials. Your summaries should:

1. Capture all key concepts, theories, and important details
2. Maintain academic rigor and precision
3. Organize information hierarchically (main topics → subtopics → details)
4. Highlight important definitions, formulas, and key takeaways
5. Use clear, concise language suitable for students
6. Preserve technical terms and explain them when necessary
7. Include relevant examples or case studies mentioned in the material

Format your summary with:
- A brief overview (2-3 sentences)
- Main sections with clear headings
- Bullet points for key concepts
- A conclusion highlighting the most critical information

Keep the summary comprehensive but concise, focusing on what a student needs to understand and remember.`,

    user: (documentTitle: string, documentContent: string, metadata?: any) => `
Please create a comprehensive summary of the following educational material:

**Document Title:** ${documentTitle}

**Content:**
${documentContent}

${metadata ? `**Additional Context:** ${JSON.stringify(metadata, null, 2)}` : ""}

Generate a well-structured, academically rigorous summary that will help students understand and retain the key information.`,
  },

  CHUNK_SYNTHESIS: {
    system: `You are an expert at synthesizing information from multiple document chunks into a coherent, comprehensive summary. Your task is to:

1. Identify and connect related concepts across different chunks
2. Eliminate redundancy while preserving all unique information
3. Maintain logical flow and structure
4. Preserve important details, examples, and technical terms
5. Create a unified narrative that reads naturally

Organize the information logically, not just in the order chunks were provided.`,

    user: (
      documentTitle: string,
      chunks: Array<{ content: string; page?: number; metadata?: any }>,
    ) => `
Create a comprehensive summary by synthesizing the following chunks from: **${documentTitle}**

${chunks
  .map(
    (chunk, idx) => `
--- Chunk ${idx + 1} ${chunk.page ? `(Page ${chunk.page})` : ""} ---
${chunk.content}
`,
  )
  .join("\n")}

Synthesize these chunks into a single, well-organized summary that captures all important information.`,
  },

  CONCEPT_EXTRACTION: {
    system: `You are an expert at identifying and explaining key concepts from educational materials. Extract the most important concepts, theories, and ideas, providing clear, concise explanations for each.`,

    user: (content: string) => `
Extract the key concepts from the following content:

${content}

For each concept, provide:
1. The concept name
2. A clear definition or explanation (2-3 sentences)
3. Why it's important

Format as a structured list.`,
  },
};

/**
 * Generate a summary using Groq API with streaming support
 */
export async function generateSummary(
  documentTitle: string,
  content: string,
  metadata?: any,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.DOCUMENT_SUMMARY.system,
        },
        {
          role: "user",
          content: PROMPTS.DOCUMENT_SUMMARY.user(
            documentTitle,
            content,
            metadata,
          ),
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent, factual summaries
      max_tokens: 4000,
      top_p: 0.9,
    });

    const summaryText = response.choices[0]?.message?.content;

    if (!summaryText) {
      throw new Error("No summary generated from AI");
    }

    return summaryText.trim();
  } catch (error: any) {
    console.error("[AIService] Summary generation failed:", error.message);
    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

/**
 * Synthesize multiple chunks into a single summary
 */
export async function synthesizeChunks(
  documentTitle: string,
  chunks: Array<{ content: string; page?: number; metadata?: any }>,
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.CHUNK_SYNTHESIS.system,
        },
        {
          role: "user",
          content: PROMPTS.CHUNK_SYNTHESIS.user(documentTitle, chunks),
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
      top_p: 0.9,
    });

    const summaryText = response.choices[0]?.message?.content;

    if (!summaryText) {
      throw new Error("No synthesis generated from AI");
    }

    return summaryText.trim();
  } catch (error: any) {
    console.error("[AIService] Chunk synthesis failed:", error.message);
    throw new Error(`Failed to synthesize chunks: ${error.message}`);
  }
}

/**
 * Extract key concepts from content
 */
export async function extractConcepts(content: string): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: PROMPTS.CONCEPT_EXTRACTION.system,
        },
        {
          role: "user",
          content: PROMPTS.CONCEPT_EXTRACTION.user(content),
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      top_p: 0.9,
    });

    const concepts = response.choices[0]?.message?.content;

    if (!concepts) {
      throw new Error("No concepts extracted from AI");
    }

    return concepts.trim();
  } catch (error: any) {
    console.error("[AIService] Concept extraction failed:", error.message);
    throw new Error(`Failed to extract concepts: ${error.message}`);
  }
}

/**
 * Count tokens in a text (approximate)
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

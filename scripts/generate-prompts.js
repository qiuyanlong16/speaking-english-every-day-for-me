// scripts/generate-prompts.js
// Usage: DEEPSEEK_API_KEY=your-key node scripts/generate-prompts.js
// Generates 30 starter prompts covering dev, AI, PM, and daily life topics.

const https = require("https");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("Set DEEPSEEK_API_KEY environment variable");
  process.exit(1);
}

const TOPICS = [
  // Software Development (12)
  { category: "dev", title: "The Importance of Code Reviews", focus: "code reviews, catching bugs early, knowledge sharing, team quality" },
  { category: "dev", title: "Understanding Git Branching", focus: "feature branches, merging, pull requests, version control workflow" },
  { category: "dev", title: "Writing Clean Code", focus: "readable code, naming conventions, functions, maintainability" },
  { category: "dev", title: "Debugging Strategies", focus: "identifying bugs, debugging tools, systematic approach, logging" },
  { category: "dev", title: "API Design Best Practices", focus: "REST APIs, endpoints, status codes, documentation, versioning" },
  { category: "dev", title: "The Role of Testing", focus: "unit tests, integration tests, test-driven development, confidence" },
  { category: "dev", title: "Continuous Integration", focus: "automated builds, running tests, catching issues early, CI pipelines" },
  { category: "dev", title: "Code Refactoring", focus: "improving code structure, not changing behavior, readability, technical debt" },
  { category: "dev", title: "Understanding Databases", focus: "SQL vs NoSQL, tables, queries, data modeling, indexes" },
  { category: "dev", title: "Working with APIs", focus: "HTTP requests, JSON, authentication, rate limits, error handling" },
  { category: "dev", title: "Mobile App Development", focus: "responsive design, native vs cross-platform, app stores, performance" },
  { category: "dev", title: "Security in Web Development", focus: "HTTPS, authentication, input validation, common vulnerabilities" },
  // AI & Machine Learning (9)
  { category: "ai", title: "What Is Artificial Intelligence", focus: "AI definition, machine learning, deep learning, applications in daily life" },
  { category: "ai", title: "Large Language Models", focus: "how LLMs work, training data, prompt engineering, capabilities and limits" },
  { category: "ai", title: "AI in the Workplace", focus: "automation, productivity tools, human-AI collaboration, job changes" },
  { category: "ai", title: "Machine Learning Basics", focus: "supervised learning, training data, models, predictions, accuracy" },
  { category: "ai", title: "Ethics in AI", focus: "bias, fairness, privacy, transparency, responsible AI development" },
  { category: "ai", title: "Computer Vision", focus: "image recognition, object detection, applications, self-driving cars" },
  { category: "ai", title: "Natural Language Processing", focus: "text understanding, translation, sentiment analysis, chatbots" },
  { category: "ai", title: "AI and Creativity", focus: "AI-generated art, music, writing, human creativity vs machine creativity" },
  { category: "ai", title: "The Future of AI", focus: "general AI, AGI, potential benefits, risks, timeline predictions" },
  // Project Management (5)
  { category: "pm", title: "Agile Methodology", focus: "sprints, standups, backlog, user stories, iterative development" },
  { category: "pm", title: "Managing a Team", focus: "communication, delegation, feedback, motivation, conflict resolution" },
  { category: "pm", title: "Risk Management", focus: "identifying risks, mitigation strategies, contingency plans, monitoring" },
  { category: "pm", title: "Setting Project Goals", focus: "SMART goals, milestones, deliverables, stakeholder alignment" },
  { category: "pm", title: "Handling Deadlines", focus: "time management, prioritization, scope management, communication" },
  // Daily Life (4)
  { category: "life", title: "My Daily Routine", focus: "morning habits, work schedule, exercise, evening activities, consistency" },
  { category: "life", title: "Learning a New Skill", focus: "practice, patience, resources, progress tracking, motivation" },
  { category: "life", title: "Travel Experiences", focus: "planning a trip, new cultures, food, language barriers, memories" },
  { category: "life", title: "Healthy Living", focus: "balanced diet, exercise, sleep, mental health, work-life balance" },
];

function callDeepSeek(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "You are an English language teacher. Write a ~100-word English passage about the given topic. The passage should be at B1-B2 English level, clear and natural. Include the key ideas specified. Return ONLY the passage text, nothing else."
        },
        { role: "user", content: prompt }
      ]
    });

    const req = https.request({
      hostname: "api.deepseek.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      }
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        const json = JSON.parse(body);
        resolve(json.choices[0].message.content.trim());
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const promptsDir = path.join(__dirname, "..", "prompts");
  const startDate = new Date();

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const filePath = path.join(promptsDir, `${dateStr}.json`);

    console.log(`[${i + 1}/${TOPICS.length}] Generating: ${topic.title} (${dateStr})`);

    try {
      const text = await callDeepSeek(`Topic: ${topic.title}\nKey ideas to include: ${topic.focus}`);

      const promptData = {
        date: dateStr,
        topic: topic.title,
        text: text
      };

      fs.writeFileSync(filePath, JSON.stringify(promptData, null, 2));
      console.log(`  -> Saved to ${filePath}`);

      // Rate limiting: wait 1 second between calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  -> Error: ${err.message}`);
    }
  }

  console.log("\nDone! Generated", TOPICS.length, "prompts.");
}

main();

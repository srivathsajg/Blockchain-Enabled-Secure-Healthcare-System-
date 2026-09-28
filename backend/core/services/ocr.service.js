const Tesseract = require("tesseract.js");
const path = require("path");
const fs = require("fs");

/**
 * Extracts text from an image using Tesseract OCR.
 * @param {string} relativeFilePath - The relative path to the image file from the backend root.
 * @returns {Promise<string>} - The extracted text.
 */
const extractTextFromImage = async (relativeFilePath) => {
  try {
    const backendRoot = path.join(__dirname, "../../");
    let absolutePath = relativeFilePath;
    if (!path.isAbsolute(relativeFilePath)) {
      absolutePath = path.join(backendRoot, relativeFilePath);
    }

    if (!fs.existsSync(absolutePath)) {
      console.warn(`OCR: File not found at ${absolutePath}`);
      return "";
    }

    console.log(`OCR: Starting high-accuracy text extraction for ${absolutePath}...`);
    
    const { data: { text } } = await Tesseract.recognize(
      absolutePath,
      'eng',
      { 
        logger: m => {
          if (m.status === 'recognizing text' && m.progress % 0.25 === 0) {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );

    console.log("OCR: Extraction complete.");
    return (text || "").trim();
  } catch (error) {
    console.error("OCR Error:", error.message);
    return "";
  }
};

/**
 * Parses medical lab indicators with high clinical accuracy,
 * handling OCR typos, multi-column layouts, and reference range confusion.
 * 
 * @param {string} text - The raw extracted OCR text.
 * @returns {Object} - Key-value map of recognized medical indicators.
 */
const parseMedicalIndicators = (text) => {
  if (!text || typeof text !== "string") return {};

  const cleanText = text.replace(/\r\n/g, "\n");
  const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
  const results = {};

  // Comprehensive definitions with regex matchers and value extractors
  const indicatorDefinitions = [
    // ── HbA1c & Blood Glucose ──────────────────────────────────────────────
    {
      name: "HbA1c",
      matchers: [
        /\b(?:hba1c|hbatc|hbalc|hba\.c)\b/i,
        /glycated\s*hemoglobin/i,
        /glyco\s*hemoglobin/i
      ],
      // Match value (e.g. 7.6, 5.8)
      valueExtractor: (line, fullText) => {
        // Look on the same line first: "HbA1c ... 7.6 %"
        const match = line.match(/(?:hba1c|hbatc|hbalc|hba\.c|glycated\s*hemoglobin)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 3.0 && val <= 20.0) return match[1];
        }
        return null;
      }
    },
    {
      name: "Blood Sugar (F)",
      matchers: [
        /fasting\s*plasma\s*glucose/i,
        /fasting\s*blood\s*sugar/i,
        /\bfbs\b/i,
        /\bfpg\b/i,
        /glucose\s*\(?fasting\)?/i,
        /glucose\s*\(f\)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/(?:fasting\s*plasma\s*glucose|fasting\s*blood\s*sugar|fbs|fpg|glucose\s*\(f\))[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 40 && val <= 600) return match[1];
        }
        return null;
      }
    },
    {
      name: "Blood Sugar (PP)",
      matchers: [
        /postprandial\s*plasma\s*glucose/i,
        /postprandial\s*blood\s*sugar/i,
        /post\s*prandial/i,
        /\bppbs\b/i,
        /\bpppg\b/i,
        /glucose\s*\(?pp\)?/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/(?:postprandial\s*plasma\s*glucose|post\s*prandial|ppbs|pppg|glucose\s*\(pp\))[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 40 && val <= 700) return match[1];
        }
        return null;
      }
    },

    // ── Hematology & Iron ──────────────────────────────────────────────────
    {
      name: "Hemoglobin",
      matchers: [
        /\b(?:hemoglobin|haemoglobin|hgb|hb)\b/i
      ],
      valueExtractor: (line) => {
        // MUST NOT match HbA1c or Glycated Hemoglobin or MCH/MCHC lines
        if (/hba1c|hbatc|hbalc|glycated|mch|mchc/i.test(line)) {
          return null;
        }
        const match = line.match(/\b(?:hemoglobin|haemoglobin|hgb|hb)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          // Realistic biological range for Hemoglobin (3 - 25 g/dL)
          if (val >= 3.0 && val <= 25.0) return match[1];
        }
        return null;
      }
    },
    {
      name: "Ferritin",
      matchers: [
        /\b(?:ferritin|feritin)\b/i
      ],
      valueExtractor: (line) => {
        // Handles "<5", "< 5", "12.4"
        const match = line.match(/\b(?:ferritin|feritin)\b[^\d<\n]*?(?:<|<=)?\s*(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          return match[1];
        }
        return null;
      }
    },
    {
      name: "Iron",
      matchers: [
        /\b(?:serum\s*iron|iron\s*\(serum\)|\biron\b)/i
      ],
      valueExtractor: (line) => {
        if (/ferritin|iron\s*binding/i.test(line)) return null;
        const match = line.match(/\b(?:serum\s*iron|\biron\b)[^\d<\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 5 && val <= 500) return match[1];
        }
        return null;
      }
    },
    {
      name: "Vitamin B12",
      matchers: [
        /\b(?:vitamin\s*b12|vit\s*b12|vitamin\s*b-12|b12)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:vitamin\s*b12|vit\s*b12|vitamin\s*b-12|b12)\b[^\d<\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Folate",
      matchers: [
        /\b(?:folate|folic\s*acid)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:folate|folic\s*acid)\b[^\d<\n]*?(?:<|<=)?\s*(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "RBC Count",
      matchers: [
        /\b(?:rbc\s*count|total\s*rbc|\brbc\b)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:rbc\s*count|total\s*rbc|\brbc\b)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 1.0 && val <= 10.0) return match[1];
        }
        return null;
      }
    },
    {
      name: "WBC Count",
      matchers: [
        /\b(?:wbc\s*count|total\s*wbc|total\s*leucocyte\s*count|tlc|\bwbc\b)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:wbc\s*count|total\s*wbc|total\s*leucocyte\s*count|tlc|\bwbc\b)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Platelets",
      matchers: [
        /\b(?:platelet\s*count|platelets|\bplt\b)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:platelet\s*count|platelets|\bplt\b)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "PCV",
      matchers: [
        /\b(?:pcv|packed\s*cell\s*volume|hematocrit|\bhct\b)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:pcv|packed\s*cell\s*volume|hematocrit|\bhct\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "MCV",
      matchers: [
        /\b(?:mcv|mean\s*corpuscular\s*volume)\b/i,
        /eY\]\s*([\d\.]+)\s*fl/i // OCR artifact for MCV
      ],
      valueExtractor: (line) => {
        const artifactMatch = line.match(/eY\]\s*(\d+(?:\.\d+)?)\s*fl/i);
        if (artifactMatch) return artifactMatch[1];
        const match = line.match(/\b(?:mcv|mean\s*corpuscular\s*volume)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "MCH",
      matchers: [
        /\bmch\b/i
      ],
      valueExtractor: (line) => {
        if (/mchc/i.test(line)) return null;
        const match = line.match(/\bmch\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "MCHC",
      matchers: [
        /\bmchc\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\bmchc\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "RDW",
      matchers: [
        /\b(?:rdw|rdw-cv|rdw-sd)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:rdw|rdw-cv|rdw-sd)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },

    // ── Lipid Profile ──────────────────────────────────────────────────────
    {
      name: "Total Cholesterol",
      matchers: [
        /total\s*cholesterol/i,
        /cholesterol\s*-\s*total/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/(?:total\s*cholesterol|cholesterol\s*-\s*total)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 50 && val <= 500) return match[1];
        }
        return null;
      }
    },
    {
      name: "Triglycerides",
      matchers: [
        /\b(?:triglycerides|triglyceride|\btg\b)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:triglycerides|triglyceride|\btg\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "HDL Cholesterol",
      matchers: [
        /\b(?:hdl\s*cholesterol|hdl-c|\bhdl\b)\b/i
      ],
      valueExtractor: (line) => {
        if (/vldl|ldl/i.test(line) && !/hdl/i.test(line)) return null;
        const match = line.match(/\b(?:hdl\s*cholesterol|hdl-c|\bhdl\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "LDL Cholesterol",
      matchers: [
        /\b(?:ldl\s*cholesterol|ldl-c|\bldl\b)\b/i
      ],
      valueExtractor: (line) => {
        if (/vldl/i.test(line)) return null;
        const match = line.match(/\b(?:ldl\s*cholesterol|ldl-c|\bldl\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "VLDL",
      matchers: [
        /\b(?:vldl\s*cholesterol|vldl-c|\bvldl\b)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:vldl\s*cholesterol|vldl-c|\bvldl\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },

    // ── Kidney Function & Electrolytes ─────────────────────────────────────
    {
      name: "Serum Creatinine",
      matchers: [
        /\b(?:serum\s*creatinine|\bcreatinine\b)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:serum\s*creatinine|\bcreatinine\b)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          const val = parseFloat(match[1]);
          if (val >= 0.2 && val <= 15.0) return match[1];
        }
        return null;
      }
    },
    {
      name: "Blood Urea",
      matchers: [
        /\b(?:blood\s*urea|\burea\b|\bbun\b)/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:blood\s*urea|\burea\b|\bbun\b)[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) {
          let valStr = match[1];
          // Handle missing decimal in OCR e.g. 284 -> 28.4
          if (parseFloat(valStr) > 100 && valStr.length === 3) {
            valStr = `${valStr.slice(0, 2)}.${valStr.slice(2)}`;
          }
          return valStr;
        }
        return null;
      }
    },
    {
      name: "Calcium",
      matchers: [
        /\b(?:calcium|serum\s*calcium)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:calcium|serum\s*calcium)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Sodium",
      matchers: [
        /\b(?:sodium|serum\s*sodium|\bna\+\b)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:sodium|serum\s*sodium|\bna\+\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Potassium",
      matchers: [
        /\b(?:potassium|serum\s*potassium|\bk\+\b)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:potassium|serum\s*potassium|\bk\+\b)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },

    // ── Liver Function ─────────────────────────────────────────────────────
    {
      name: "SGOT (AST)",
      matchers: [
        /\b(?:sgot|ast)\b/i,
        /aspartate\s*aminotransferase/i
      ],
      valueExtractor: (line) => {
        // STRICTLY IGNORE lines with "fasting" or "glucose"
        if (/fasting|glucose|cholesterol/i.test(line)) return null;
        const match = line.match(/\b(?:sgot|\bast\b|aspartate\s*aminotransferase)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "SGPT (ALT)",
      matchers: [
        /\b(?:sgpt|alt)\b/i,
        /alanine\s*aminotransferase/i
      ],
      valueExtractor: (line) => {
        if (/salt|exalt/i.test(line)) return null;
        const match = line.match(/\b(?:sgpt|\balt\b|alanine\s*aminotransferase)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Albumin",
      matchers: [
        /\b(?:albumin|serum\s*albumin)\b/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/\b(?:albumin|serum\s*albumin)\b[^\d\n]*?(\d+(?:\.\d+)?)/i);
        if (match && match[1]) return match[1];
        return null;
      }
    },
    {
      name: "Urine Sugar",
      matchers: [
        /urine\s*(?:routine\s*)?\(?sugar\)?/i,
        /urine\s*glucose/i
      ],
      valueExtractor: (line) => {
        const match = line.match(/urine\s*(?:routine\s*)?\(?sugar\)?[^\w\n]*?(negative|nil|trace|positive|\d\+)/i);
        if (match && match[1]) return match[1].toLowerCase();
        return null;
      }
    }
  ];

  // 1. Line-by-line pass (filtering out header/footer/comment noise)
  const isIgnoredLine = (l) => /^(?:comments?|notes?|ref\.\s*doctor|doctor|facility|address|sample\s*no|uhid|episode|collection\s*date|report\s*date|verified\s*by|authorized\s*by|dr\.)/i.test(l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isIgnoredLine(line)) continue;

    for (const def of indicatorDefinitions) {
      if (results[def.name]) continue; // Already found

      const matchesAny = def.matchers.some(rgx => rgx.test(line));
      if (matchesAny) {
        // Try current line
        let extracted = def.valueExtractor(line, cleanText);
        // If not found and next line exists and is numeric or short, try combined line
        if ((extracted === null || extracted === undefined || extracted === "") && i + 1 < lines.length && !isIgnoredLine(lines[i + 1])) {
          extracted = def.valueExtractor(`${line} ${lines[i + 1]}`, cleanText);
        }
        if (extracted !== null && extracted !== undefined && extracted !== "") {
          results[def.name] = extracted;
        }
      }
    }
  }

  return results;
};

module.exports = {
  extractTextFromImage,
  parseMedicalIndicators,
};

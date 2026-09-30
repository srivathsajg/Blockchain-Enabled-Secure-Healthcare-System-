const Tesseract = require("tesseract.js");
const path = require("path");
const fs = require("fs");
const { evaluateBiomarkerStatus } = require("../../modules/track/biomarker.evaluator");

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
 * extracting test name, value, unit, biological reference interval, and calculated status.
 * 
 * @param {string} text - The raw extracted OCR text.
 * @param {string} [gender="default"] - "male" | "female"
 * @returns {Object} - Key-value map of recognized medical indicators with complete provenance.
 */
const parseMedicalIndicators = (text, gender = "default") => {
  if (!text || typeof text !== "string") return {};

  const cleanText = text.replace(/\r\n/g, "\n");
  const lines = cleanText.split("\n").map(l => l.trim()).filter(Boolean);
  const results = {};

  // Comprehensive indicator definitions with robust matchers and line extractors
  const indicatorDefinitions = [
    // ── HbA1c & Blood Glucose ──────────────────────────────────────────────
    {
      name: "HbA1c",
      matchers: [/\b(?:hba1c|hbatc|hbalc|hba\.c)\b/i, /glycated\s*hemoglobin/i, /glyco\s*hemoglobin/i],
      extractor: (line) => {
        const m = line.match(/(?:hba1c|hbatc|hbalc|hba\.c|glycated\s*hemoglobin)[^\d\n]*?(\d+(?:\.\d+)?)\s*(%|percent)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 3.0 || val > 20.0) return null;
        return { value: val, unit: m[2] || "%", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Blood Sugar (F)",
      matchers: [/fasting\s*plasma\s*glucose/i, /fasting\s*blood\s*sugar/i, /\bfbs\b/i, /\bfpg\b/i, /glucose\s*\(?fasting\)?/i, /glucose\s*\(f\)/i],
      extractor: (line) => {
        const m = line.match(/(?:fasting\s*plasma\s*glucose|fasting\s*blood\s*sugar|fbs|fpg|glucose\s*\(f\))[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 40 || val > 600) return null;
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Blood Sugar (PP)",
      matchers: [/postprandial\s*plasma\s*glucose/i, /postprandial\s*blood\s*sugar/i, /post\s*prandial/i, /\bppbs\b/i, /\bpppg\b/i, /glucose\s*\(?pp\)?/i],
      extractor: (line) => {
        const m = line.match(/(?:postprandial\s*plasma\s*glucose|post\s*prandial|ppbs|pppg|glucose\s*\(pp\))[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 40 || val > 700) return null;
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },

    // ── Hematology & Complete Blood Count ──────────────────────────────────
    {
      name: "Hemoglobin",
      matchers: [/\b(?:hemoglobin|haemoglobin|hgb|hb)\b/i],
      extractor: (line) => {
        if (/hba1c|hbatc|hbalc|glycated|mch|mchc/i.test(line)) return null;
        const m = line.match(/\b(?:hemoglobin|haemoglobin|hgb|hb)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL|HIGN)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 3.0 || val > 25.0) return null;
        return { value: val, unit: m[2] || "g/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "RBC Count",
      matchers: [/\b(?:rbc\s*count|total\s*rbc|\brbc\b)/i],
      extractor: (line) => {
        const m = line.match(/\b(?:rbc\s*count|total\s*rbc|\brbc\b)[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 1.0 || val > 10.0) return null;
        return { value: val, unit: m[2] || "million/µL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "PCV",
      matchers: [/\b(?:pcv|packed\s*cell\s*volume|hematocrit|\bhct\b)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:pcv|packed\s*cell\s*volume|hematocrit|\bhct\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*([%\w]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 10.0 || val > 75.0) return null;
        return { value: val, unit: m[2] || "%", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "MCV",
      matchers: [/\b(?:mcv|mean\s*corpuscular\s*volume)\b/i, /eY\]\s*([\d\.]+)/i],
      extractor: (line) => {
        const m = line.match(/(?:mcv|mean\s*corpuscular\s*volume|eY\])[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL|HIGN)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 40.0 || val > 140.0) return null;
        return { value: val, unit: m[2] || "fL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "MCH",
      matchers: [/\bmch\b/i],
      extractor: (line) => {
        if (/mchc/i.test(line)) return null;
        const m = line.match(/\bmch\b[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 10.0 || val > 50.0) return null;
        return { value: val, unit: m[2] || "pg", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "MCHC",
      matchers: [/\bmchc\b/i],
      extractor: (line) => {
        const m = line.match(/\bmchc\b[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 15.0 || val > 50.0) return null;
        return { value: val, unit: m[2] || "g/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "RDW",
      matchers: [/\b(?:rdw|rdw-cv|rdw-sd)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:rdw|rdw-cv|rdw-sd)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*([%\w]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 5.0 || val > 40.0) return null;
        return { value: val, unit: m[2] || "%", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Platelets",
      matchers: [/\b(?:platelet\s*count|platelets|\bplt\b)/i],
      extractor: (line) => {
        const m = line.match(/\b(?:platelet\s*count|platelets|\bplt\b)[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\d\/\^]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        return { value: val, unit: m[2] || "10^3/µL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "WBC Count",
      matchers: [/\b(?:wbc\s*count|total\s*wbc|total\s*leucocyte\s*count|tlc|\bwbc\b)/i],
      extractor: (line) => {
        const m = line.match(/\b(?:wbc\s*count|total\s*wbc|total\s*leucocyte\s*count|tlc|\bwbc\b)[^\d\n]*?(\d+(?:\.\d+)?)\s*([a-z\d\/\^]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        let val = parseFloat(m[1]);
        if (val > 1000) val = val / 1000; // e.g. 8400 -> 8.4 10^3/µL
        return { value: val, unit: m[2] || "10^3/µL", refStr: m[3], flag: m[4] };
      }
    },

    // ── Iron, Ferritin & Vitamins ──────────────────────────────────────────
    {
      name: "Ferritin",
      matchers: [/\b(?:ferritin|feritin)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:ferritin|feritin)\b[^\d<\n]*?(<|<=)?\s*(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?/i);
        if (!m || !m[2]) return null;
        const val = parseFloat(m[2]);
        return { value: val, unit: m[3] || "ng/mL", refStr: m[4], op: m[1] };
      }
    },
    {
      name: "Iron",
      matchers: [/\b(?:serum\s*iron|iron\s*\(serum\)|\biron\b)/i],
      extractor: (line) => {
        if (/ferritin|iron\s*binding/i.test(line)) return null;
        const m = line.match(/\b(?:serum\s*iron|\biron\b)[^\d<\n]*?(\d+(?:\.\d+)?)\s*([a-z\/µ]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 5 || val > 500) return null;
        return { value: val, unit: m[2] || "µg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Vitamin B12",
      matchers: [/\b(?:vitamin\s*b12|vit\s*b12|vitamin\s*b-12|b12)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:vitamin\s*b12|vit\s*b12|vitamin\s*b-12|b12)\b[^\d<\n]*?(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        return { value: val, unit: m[2] || "pg/mL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Folate",
      matchers: [/\b(?:folate|folic\s*acid)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:folate|folic\s*acid)\b[^\d<\n]*?(?:<|<=)?\s*(\d+(?:\.\d+)?)\s*([a-z\/]+)?\s*([><]=?|\>\s*|\<\s*)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\d+)?/i);
        if (!m || !m[1]) return null;
        let val = parseFloat(m[1]);
        if (val > 10 && val < 100) val = val / 10; // Handle missing decimal e.g. 27 -> 2.7
        return { value: val, unit: m[2] || "ng/mL", refOperator: ">=", referenceLow: 3.1, referenceText: "> 3.1 ng/mL" };
      }
    },

    // ── Lipid Profile ──────────────────────────────────────────────────────
    {
      name: "Total Cholesterol",
      matchers: [/total\s*cholesterol/i, /cholesterol\s*-\s*total/i],
      extractor: (line) => {
        const m = line.match(/(?:total\s*cholesterol|cholesterol\s*-\s*total)[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 50 || val > 500) return null;
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Triglycerides",
      matchers: [/\b(?:triglycerides|triglyceride|\btg\b)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:triglycerides|triglyceride|\btg\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "HDL Cholesterol",
      matchers: [/\b(?:hdl\s*cholesterol|hdl-c|\bhdl\b)\b/i],
      extractor: (line) => {
        if (/vldl|ldl/i.test(line) && !/hdl/i.test(line)) return null;
        const m = line.match(/\b(?:hdl\s*cholesterol|hdl-c|\bhdl\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "LDL Cholesterol",
      matchers: [/\b(?:ldl\s*cholesterol|ldl-c|\bldl\b)\b/i],
      extractor: (line) => {
        if (/vldl/i.test(line)) return null;
        const m = line.match(/\b(?:ldl\s*cholesterol|ldl-c|\bldl\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },

    // ── Kidney Function & Electrolytes ─────────────────────────────────────
    {
      name: "Serum Creatinine",
      matchers: [/\b(?:serum\s*creatinine|\bcreatinine\b)/i],
      extractor: (line) => {
        const m = line.match(/\b(?:serum\s*creatinine|\bcreatinine\b)[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        const val = parseFloat(m[1]);
        if (val < 0.2 || val > 15.0) return null;
        return { value: val, unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Blood Urea",
      matchers: [/\b(?:blood\s*urea|\burea\b|\bbun\b)/i],
      extractor: (line) => {
        const m = line.match(/\b(?:blood\s*urea|\burea\b|\bbun\b)[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        let valStr = m[1];
        if (parseFloat(valStr) > 100 && valStr.length === 3) {
          valStr = `${valStr.slice(0, 2)}.${valStr.slice(2)}`;
        }
        return { value: parseFloat(valStr), unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Calcium",
      matchers: [/\b(?:calcium|serum\s*calcium)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:calcium|serum\s*calcium)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(mg\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "mg/dL", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Sodium",
      matchers: [/\b(?:sodium|serum\s*sodium|\bna\+\b)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:sodium|serum\s*sodium|\bna\+\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(meq\/l|mmol\/l)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "mEq/L", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Potassium",
      matchers: [/\b(?:potassium|serum\s*potassium|\bk\+\b)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:potassium|serum\s*potassium|\bk\+\b)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(meq\/l|mmol\/l)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "mEq/L", refStr: m[3], flag: m[4] };
      }
    },

    // ── Liver Function ─────────────────────────────────────────────────────
    {
      name: "SGOT (AST)",
      matchers: [/\b(?:sgot|ast)\b/i, /aspartate\s*aminotransferase/i],
      extractor: (line) => {
        if (/fasting|glucose|cholesterol/i.test(line)) return null;
        const m = line.match(/\b(?:sgot|\bast\b|aspartate\s*aminotransferase)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(u\/l|iu\/l)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "U/L", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "SGPT (ALT)",
      matchers: [/\b(?:sgpt|alt)\b/i, /alanine\s*aminotransferase/i],
      extractor: (line) => {
        if (/salt|exalt/i.test(line)) return null;
        const m = line.match(/\b(?:sgpt|\balt\b|alanine\s*aminotransferase)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(u\/l|iu\/l)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "U/L", refStr: m[3], flag: m[4] };
      }
    },
    {
      name: "Albumin",
      matchers: [/\b(?:albumin|serum\s*albumin)\b/i],
      extractor: (line) => {
        const m = line.match(/\b(?:albumin|serum\s*albumin)\b[^\d\n]*?(\d+(?:\.\d+)?)\s*(g\/dl)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
        if (!m || !m[1]) return null;
        return { value: parseFloat(m[1]), unit: m[2] || "g/dL", refStr: m[3], flag: m[4] };
      }
    },
  ];

  const isIgnoredLine = (l) => /^(?:comments?|notes?|ref\.\s*doctor|doctor|facility|address|sample\s*no|uhid|episode|collection\s*date|report\s*date|verified\s*by|authorized\s*by|dr\.)/i.test(l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isIgnoredLine(line)) continue;

    for (const def of indicatorDefinitions) {
      if (results[def.name]) continue; // Already found

      const matchesAny = def.matchers.some(rgx => rgx.test(line));
      if (matchesAny) {
        let extracted = def.extractor(line);
        if (!extracted && i + 1 < lines.length && !isIgnoredLine(lines[i + 1])) {
          extracted = def.extractor(`${line} ${lines[i + 1]}`);
        }

        if (extracted && extracted.value !== null && !isNaN(extracted.value)) {
          const evaluated = evaluateBiomarkerStatus({
            name: def.name,
            value: extracted.value,
            unit: extracted.unit,
            referenceLow: extracted.referenceLow,
            referenceHigh: extracted.referenceHigh,
            referenceOperator: extracted.refOperator || extracted.referenceOperator,
            referenceText: extracted.referenceText || extracted.refStr,
            sourcePrintedStatus: extracted.flag,
            gender,
            source: "uploaded_lab_report",
          });

          results[def.name] = evaluated;
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

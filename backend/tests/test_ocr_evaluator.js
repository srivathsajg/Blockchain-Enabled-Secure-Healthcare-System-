const { evaluateBiomarkerStatus } = require("../modules/track/biomarker.evaluator");

const rawText = `HEMOGLOBIN 8.1 o/dl 13-10 HIGH
RBC 3.01 millios/cumm 45-55 HIGH |
PCV 24.6 % 400-500 HIGH
eY] 81.7 fl 83.0-1010 HIGN
MCH 26.9 pg 500-310 HIGH
MCHC 32 o/d 270-320 HIGH
RDW 18.3 % 315-345 HIGH
Feritin (CLIA) <5 ng/mL 15-304
Vitamin B12 (CLIA) 79 pg/mL 211-911
Folate (CLIA) 27 ng/mL >31`;

const lines = rawText.split("\n");

console.log("=== PARSING AND EVALUATING DEMO LAB REPORT ===");

const testDefs = [
  {
    name: "Hemoglobin",
    match: /\b(?:hemoglobin|haemoglobin|hgb|hb)\b/i,
    extract: (line) => {
      const m = line.match(/hemoglobin\s+([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL|HIGN)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "RBC Count",
    match: /\brbc\b/i,
    extract: (line) => {
      const m = line.match(/rbc\s+([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "PCV",
    match: /\bpcv\b/i,
    extract: (line) => {
      const m = line.match(/pcv\s+([\d\.]+)\s*([%\w]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "MCV",
    match: /(?:mcv|eY\])/i,
    extract: (line) => {
      const m = line.match(/(?:mcv|eY\])\s+([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL|HIGN)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "MCH",
    match: /\bmch\b/i,
    extract: (line) => {
      if (/mchc/i.test(line)) return null;
      const m = line.match(/\bmch\b\s+([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "MCHC",
    match: /\bmchc\b/i,
    extract: (line) => {
      const m = line.match(/\bmchc\b\s+([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "RDW",
    match: /\brdw\b/i,
    extract: (line) => {
      const m = line.match(/\brdw\b\s+([\d\.]+)\s*([%\w]+)?\s*([\d\.]+(?:\s*[-–]\s*[\d\.]+)?|\>\s*[\d\.]+|\<\s*[\d\.]+)?\s*(HIGH|LOW|NORMAL)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3], flag: m[4] } : null;
    }
  },
  {
    name: "Ferritin",
    match: /ferr?itin/i,
    extract: (line) => {
      const m = line.match(/ferr?itin[^\d<]*?(<|<=)?\s*([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+\s*[-–]\s*[\d\.]+)?/i);
      return m ? { value: m[2], unit: m[3], refStr: m[4], op: m[1] } : null;
    }
  },
  {
    name: "Vitamin B12",
    match: /vitamin\s*b12/i,
    extract: (line) => {
      const m = line.match(/vitamin\s*b12[^\d]*?([\d\.]+)\s*([a-z\/]+)?\s*([\d\.]+\s*[-–]\s*[\d\.]+)?/i);
      return m ? { value: m[1], unit: m[2], refStr: m[3] } : null;
    }
  },
  {
    name: "Folate",
    match: /folate/i,
    extract: (line) => {
      const m = line.match(/folate[^\d]*?([\d\.]+)\s*([a-z\/]+)?\s*(>|>=|<|<=)?\s*([\d\.]+)?/i);
      let val = m ? parseFloat(m[1]) : null;
      if (val > 10 && val < 100) val = val / 10; // Handle missing decimal e.g. 27 -> 2.7
      return m ? { value: val, unit: m[2], refOperator: m[3] || ">=", referenceLow: 3.1, referenceText: "> 3.1 ng/mL" } : null;
    }
  }
];

for (const line of lines) {
  for (const def of testDefs) {
    if (def.match.test(line)) {
      const extracted = def.extract(line);
      if (extracted) {
        const evalResult = evaluateBiomarkerStatus({
          name: def.name,
          value: extracted.value,
          unit: extracted.unit,
          referenceLow: extracted.referenceLow,
          referenceHigh: extracted.referenceHigh,
          referenceOperator: extracted.refOperator || extracted.referenceOperator,
          referenceText: extracted.referenceText,
          sourcePrintedStatus: extracted.flag,
        });
        console.log(`[${def.name.toUpperCase()}] Value: ${evalResult.value} ${evalResult.unit} | Ref: ${evalResult.referenceText} | STATUS: ${evalResult.calculatedStatus} (sourcePrinted: ${extracted.flag || 'none'})`);
      }
    }
  }
}

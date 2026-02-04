#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'templates', 'resume.tex');
const DATA_FILE = path.join(ROOT, '_data', 'resume.yml');
const OUTPUT_DIR = path.join(ROOT, 'assets', 'docs');
const TEX_OUTPUT = path.join(OUTPUT_DIR, 'TimPevey_resume_2025.tex');
const PDF_OUTPUT = path.join(OUTPUT_DIR, 'TimPevey_resume_2025.pdf');

// Read YAML data
console.log('Reading resume data...');
const data = yaml.load(fs.readFileSync(DATA_FILE, 'utf8'));

// Read template
console.log('Reading template...');
let tex = fs.readFileSync(TEMPLATE, 'utf8');

// Helper to escape LaTeX special characters
function escapeLatex(str) {
  if (!str) return '';
  if (typeof str !== 'string') str = String(str);
  return str
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// Helper to convert markdown links to LaTeX
function convertLinks(str) {
  if (!str) return '';
  // Convert [text](url) to \href{url}{text}
  return str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');
}

// Process text with escaping and link conversion
function processText(str) {
  if (!str) return '';
  if (typeof str !== 'string') str = String(str);

  // Extract markdown links first, before escaping
  const links = [];
  let result = str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const placeholder = `LINKPLACEHOLDER${links.length}ENDLINK`;
    links.push({ text, url });
    return placeholder;
  });

  // Extract markdown italics (*text*), before escaping
  const italics = [];
  result = result.replace(/\*([^*]+)\*/g, (match, text) => {
    const placeholder = `ITALICPLACEHOLDER${italics.length}ENDITALIC`;
    italics.push(text);
    return placeholder;
  });

  // Escape the rest
  result = escapeLatex(result);

  // Restore links with LaTeX href
  links.forEach((link, i) => {
    const placeholder = `LINKPLACEHOLDER${i}ENDLINK`;
    const safeUrl = link.url.replace(/#/g, '\\#');
    result = result.replace(placeholder, `\\href{${safeUrl}}{${escapeLatex(link.text)}}`);
  });

  // Restore italics with LaTeX textit
  italics.forEach((text, i) => {
    const placeholder = `ITALICPLACEHOLDER${i}ENDITALIC`;
    result = result.replace(placeholder, `\\textit{${escapeLatex(text)}}`);
  });

  return result;
}

// Replace basic fields
tex = tex.replace(/%%NAME%%/g, escapeLatex(data.name));
tex = tex.replace(/%%PHONE%%/g, escapeLatex(data.phone || ''));
tex = tex.replace(/%%EMAIL%%/g, escapeLatex(data.email));

// Summary
tex = tex.replace(/%%SUMMARY%%/g, processText(data.summary.trim()));

// Experience
let experienceLatex = '';
data.experience.forEach(job => {
  experienceLatex += `\\jobtitle{${escapeLatex(job.company)}}{${escapeLatex(job.role)}}{${escapeLatex(job.dates)}}\n`;
  experienceLatex += '\\begin{itemize}[leftmargin=1.5em, itemsep=0.2em, parsep=0em, topsep=0em]\n';
  job.details.forEach(detail => {
    experienceLatex += `  \\item ${processText(detail)}\n`;
  });
  experienceLatex += '\\end{itemize}\n';
  if (job.footer) {
    experienceLatex += `\\vspace{0.3em}{\\itshape ${processText(job.footer)}}\\par\n`;
  }
  experienceLatex += '\\vspace{0.5em}\n';
});
tex = tex.replace(/%%EXPERIENCE%%/g, experienceLatex);

// Competencies
let competenciesLatex = '';
data.competencies.forEach(comp => {
  competenciesLatex += `\\competency{${escapeLatex(comp.title)}}{${processText(comp.content)}}\n`;
});
tex = tex.replace(/%%COMPETENCIES%%/g, competenciesLatex);

// Education
let educationLatex = '';
data.education.forEach(edu => {
  educationLatex += `\\edu{${escapeLatex(edu.degree)}}{${escapeLatex(edu.school)}}{${escapeLatex(edu.dates)}}\n`;
  educationLatex += '\\begin{itemize}[leftmargin=1.5em, itemsep=0.2em, parsep=0em, topsep=0em]\n';
  edu.details.forEach(detail => {
    educationLatex += `  \\item ${processText(detail)}\n`;
  });
  educationLatex += '\\end{itemize}\n';
  educationLatex += '\\vspace{0.5em}\n';
});
tex = tex.replace(/%%EDUCATION%%/g, educationLatex);

// Sidebar projects
function generateProjects(projects) {
  let latex = '';
  projects.forEach(proj => {
    // Escape # in URLs for hyperref
    const safeUrl = proj.url.replace(/#/g, '\\#');
    latex += `\\projectlink{${escapeLatex(proj.title)}}{${safeUrl}}\n`;
    latex += `\\projectdesc{${processText(proj.description)}}\n`;
  });
  return latex;
}

tex = tex.replace(/%%DESIGN_PROJECTS%%/g, generateProjects(data.sidebar.design_projects));
tex = tex.replace(/%%DATA_PROJECTS%%/g, generateProjects(data.sidebar.data_projects));
// Filter out Master's Thesis from writing samples
const writingSamplesFiltered = data.sidebar.writing_samples.filter(
  proj => !proj.title.toLowerCase().includes('thesis')
);
tex = tex.replace(/%%WRITING_SAMPLES%%/g, generateProjects(writingSamplesFiltered));

// Write generated tex file
console.log(`Writing ${TEX_OUTPUT}...`);
fs.writeFileSync(TEX_OUTPUT, tex);

// Convert QR SVG to PDF if needed and copy to output dir
const qrSvg = path.join(ROOT, 'assets', 'icons', 'qr-resume.svg');
const qrPdf = path.join(ROOT, 'assets', 'icons', 'qr-resume.pdf');
const qrPdfOutput = path.join(OUTPUT_DIR, 'qr-resume.pdf');
if (!fs.existsSync(qrPdf) || fs.statSync(qrSvg).mtime > fs.statSync(qrPdf).mtime) {
  console.log('Converting QR code SVG to PDF...');
  try {
    execSync(`rsvg-convert -f pdf -o "${qrPdf}" "${qrSvg}"`, { stdio: 'inherit' });
  } catch (e) {
    console.log('Warning: Could not convert QR SVG to PDF. Install librsvg2-bin.');
  }
}
// Copy QR PDF to output directory
if (fs.existsSync(qrPdf)) {
  fs.copyFileSync(qrPdf, qrPdfOutput);
}

// Compile LaTeX (run twice for references)
console.log('Compiling LaTeX...');
try {
  execSync(`cd "${OUTPUT_DIR}" && pdflatex -interaction=nonstopmode "${path.basename(TEX_OUTPUT)}"`, {
    stdio: 'pipe',
    cwd: OUTPUT_DIR
  });
} catch (e) {
  // pdflatex may return non-zero even when PDF is generated
}

// Check if PDF was created
if (fs.existsSync(PDF_OUTPUT)) {
  console.log(`\nPDF generated: ${PDF_OUTPUT}`);
} else {
  console.error('LaTeX compilation failed. Check the .log file for errors.');
  process.exit(1);
}

// Clean up auxiliary files
const auxFiles = ['.aux', '.log', '.out'];
auxFiles.forEach(ext => {
  const file = TEX_OUTPUT.replace('.tex', ext);
  if (fs.existsSync(file)) fs.unlinkSync(file);
});

console.log('Done!');

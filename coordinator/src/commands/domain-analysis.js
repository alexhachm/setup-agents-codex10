'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadKnowledgeMetadata() {
  return require('../knowledge-metadata');
}

function getCodebaseMapHash(projectDir) {
  const mapPath = path.join(projectDir, '.claude', 'state', 'codebase-map.json');
  try {
    const mapContent = fs.readFileSync(mapPath, 'utf8');
    return crypto.createHash('sha256').update(mapContent).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

function writeApprovedDomainDoc({ db, projectDir, analysis, knowledgeMeta }) {
  const domainDir = path.join(projectDir, '.claude', 'knowledge', 'codebase', 'domains');
  fs.mkdirSync(domainDir, { recursive: true });
  let content = analysis.draft_payload || '';
  if (analysis.human_feedback) {
    content += '\n\n## Human-Confirmed Context\n' + analysis.human_feedback + '\n';
  }
  fs.writeFileSync(path.join(domainDir, `${analysis.domain}.md`), content);
  knowledgeMeta.resetDomainResearch(projectDir, analysis.domain);
  db.sendMail('master-1', 'domain_review_completed', {
    analysis_id: analysis.id,
    domain: analysis.domain,
    status: 'approved',
  });
}

function handleDomainAnalysisCommand(command, args, {
  db,
  projectDir,
  knowledgeMeta = loadKnowledgeMetadata(),
}) {
  const projDir = projectDir || process.cwd();

  switch (command) {
    case 'analyze-domain': {
      const mapHash = getCodebaseMapHash(projDir);
      const analysis = db.createDomainAnalysis(args.domain, mapHash);
      db.sendMail('architect', 'domain_analysis_requested', {
        analysis_id: analysis.id,
        domain: args.domain,
      });
      return { ok: true, id: analysis.id, domain: args.domain };
    }

    case 'domain-analysis': {
      const analysis = db.getDomainAnalysis(args.id);
      if (!analysis) return { ok: false, error: 'Domain analysis not found' };
      return { ok: true, analysis };
    }

    case 'domain-analyses': {
      const items = db.listDomainAnalyses({
        domain: args.domain,
        status: args.status,
        limit: args.limit || 50,
      });
      return { ok: true, items, count: items.length };
    }

    case 'submit-domain-draft': {
      const updated = db.updateDomainAnalysis(args.id, {
        status: 'review_pending',
        draft_payload: args.draft_payload,
        review_sheet: args.review_sheet,
        analyzed_files: args.analyzed_files,
      });
      if (updated) {
        db.sendMail('master-1', 'domain_review_ready', {
          analysis_id: args.id,
          domain: updated.domain,
          review_sheet: args.review_sheet,
        });
        db.log('coordinator', 'domain_draft_submitted', { id: args.id, domain: updated.domain });
      }
      return { ok: true, analysis: updated };
    }

    case 'approve-domain': {
      const approved = db.approveDomainAnalysis(args.id, args.feedback || null);
      if (!approved) return { ok: false, error: 'Analysis not in review_pending state' };
      const analysis = db.getDomainAnalysis(args.id);
      if (analysis) {
        writeApprovedDomainDoc({ db, projectDir: projDir, analysis, knowledgeMeta });
      }
      return { ok: true, id: args.id };
    }

    case 'reject-domain': {
      const rejected = db.rejectDomainAnalysis(args.id, args.feedback || null);
      if (!rejected) return { ok: false, error: 'Analysis not in review_pending state' };
      const analysis = db.getDomainAnalysis(args.id);
      if (analysis) {
        db.sendMail('master-1', 'domain_review_completed', {
          analysis_id: args.id,
          domain: analysis.domain,
          status: 'rejected',
        });
      }
      return { ok: true, id: args.id };
    }

    default:
      throw new Error(`Unknown domain analysis command: ${command}`);
  }
}

module.exports = {
  handleDomainAnalysisCommand,
};

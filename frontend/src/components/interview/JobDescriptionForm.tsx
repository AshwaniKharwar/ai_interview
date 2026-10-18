"use client";

import React from "react";
import { Briefcase, Building, Layers, Sparkles } from "lucide-react";

interface JobDescriptionFormProps {
  jobTitle: string;
  setJobTitle: (val: string) => void;
  companyName: string;
  setCompanyName: (val: string) => void;
  department: string;
  setDepartment: (val: string) => void;
  jobDescriptionRaw: string;
  setJobDescriptionRaw: (val: string) => void;
}

const PRESETS = [
  {
    name: "Staff Backend / Distributed Systems",
    title: "Staff Distributed Systems Engineer",
    company: "Acme Cloud Infrastructure",
    department: "Core Platform",
    jd: `About the Role:
We are looking for a Staff Distributed Systems Engineer to lead the architecture of our real-time transactional event streaming pipeline handling 50k+ TPS.

Key Responsibilities:
- Architect distributed consensus, replication, and disaster recovery strategies using Go, Kafka, and PostgreSQL.
- Drive zero-downtime database migrations, partitioning, and caching tiers with Redis.
- Mentor senior engineers and establish architectural review standards across the organization.

Requirements:
- 7+ years of experience building mission-critical backend microservices in Go or Java.
- Proven mastery of distributed messaging systems (Kafka, Pulsar) and event-driven patterns (Saga, Outbox).
- Deep expertise in relational data modeling, indexing trade-offs, and ACID transaction isolation levels.
- Familiarity with Kubernetes, Docker, and observability with Prometheus/OpenTelemetry.`,
  },
  {
    name: "Lead Frontend Architect",
    title: "Lead Frontend Architect",
    company: "NextGen Digital",
    department: "Design Systems & Web",
    jd: `About the Role:
We are looking for a Lead Frontend Architect to shape our next-generation web application ecosystem using React, Next.js, and TypeScript.

Key Responsibilities:
- Architect scalable micro-frontends, server-side rendering strategies, and shared component libraries.
- Optimize Core Web Vitals (LCP, INP, CLS) across millions of monthly active users.
- Drive client-side state management, real-time WebSocket interfaces, and accessibility (WCAG 2.1 AA) compliance.

Requirements:
- 6+ years building high-traffic production web applications in modern React, TypeScript, and Next.js.
- Deep understanding of browser rendering engines, performance profiling, and bundle optimization.
- Experience with WebRTC or WebSocket streaming interfaces is a huge plus.`,
  },
  {
    name: "Platform / DevOps Architect",
    title: "Staff Cloud Platform Architect",
    company: "FinScale Technologies",
    department: "Cloud Operations",
    jd: `About the Role:
Join our Cloud Operations group to design multi-region Kubernetes infrastructure and automated CI/CD deployment pipelines on AWS/GCP.

Key Responsibilities:
- Design and maintain production Kubernetes clusters running custom CRDs and operators.
- Implement GitOps workflows with ArgoCD, Terraform, and GitHub Actions.
- Ensure 99.99% system availability, multi-region failover, and automated incident response.

Requirements:
- 6+ years in cloud infrastructure, container orchestration, and infrastructure as code (Terraform).
- Deep networking knowledge: BGP, Cilium/eBPF, Envoy service meshes, and Istio.
- Strong security hardening experience (SOC2, zero-trust mTLS).`,
  },
];

export function JobDescriptionForm({
  jobTitle,
  setJobTitle,
  companyName,
  setCompanyName,
  department,
  setDepartment,
  jobDescriptionRaw,
  setJobDescriptionRaw,
}: JobDescriptionFormProps) {
  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setJobTitle(preset.title);
    setCompanyName(preset.company);
    setDepartment(preset.department);
    setJobDescriptionRaw(preset.jd);
  };

  return (
    <div className="space-y-6">
      {/* Preset Pills */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-xs font-medium text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Quick Role Presets (Click to autofill):</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 transition-all shadow-xs"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Target Role Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Target Job Title <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              required
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Lead Backend Engineer"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Company Name
          </label>
          <div className="relative">
            <Building className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Stripe, Acme Corp"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Department / Team
          </label>
          <div className="relative">
            <Layers className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Platform Core, Payments"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Raw Job Description Textarea */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Job Description & Role Requirements <span className="text-rose-400">*</span>
          </label>
          <span className="text-[11px] text-slate-500 font-mono">
            {jobDescriptionRaw.length} chars
          </span>
        </div>
        <textarea
          rows={9}
          required
          value={jobDescriptionRaw}
          onChange={(e) => setJobDescriptionRaw(e.target.value)}
          placeholder="Paste the full job description here (responsibilities, requirements, tech stack, team goals)..."
          className="w-full p-4 rounded-xl bg-slate-900 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans resize-y"
        />
      </div>
    </div>
  );
}

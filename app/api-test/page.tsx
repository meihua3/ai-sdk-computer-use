"use client";

import { useState } from "react";

export default function ApiTestPage() {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setOutput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "api-test-session",
          sandboxId: null,
          messages: [
            {
              role: "user",
              content: "Say hello in one sentence.",
              parts: [{ type: "text", text: "Say hello in one sentence." }],
            },
          ],
        }),
      });

      setOutput(`Status: ${res.status} ${res.statusText}\n\n`);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value));
      }
    } catch (e) {
      setOutput(`Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#f8fafc] flex flex-col items-center justify-center p-8 gap-6">
      <h1 className="text-lg font-semibold">API 接口测试</h1>

      <button
        onClick={runTest}
        disabled={loading}
        className="px-6 py-2 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
      >
        {loading ? "请求中..." : "发送测试请求"}
      </button>

      <textarea
        readOnly
        value={output}
        placeholder="响应内容会显示在这里..."
        className="w-full max-w-3xl h-80 bg-[#1E293B] border border-white/10 rounded-lg p-4 text-sm font-mono text-[#94a3b8] resize-none outline-none"
      />
    </div>
  );
}

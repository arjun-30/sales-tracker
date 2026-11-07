import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { usePlant } from "../context/PlantContext";
import { formatDate, formatTime } from "../lib/format";
import { Card, Notice, PageHeader, Status, Tabs } from "../components/ui/Card";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

interface OutboundMessage {
  id: string;
  channel: "sms" | "whatsapp";
  kind: string;
  to: string;
  body: string;
  status: "sent" | "failed" | "logged";
  error: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  store_otp: "Shop code",
  order_owner: "Order, to owner",
  order_pdf: "Order copy (PDF)",
  order_admin: "Order, to admin",
  visit_owner: "Visit, to owner",
  visit_admin: "Visit, to admin",
};

type TabValue = "all" | "orders" | "visits" | "codes" | "failed";

const inTab: Record<TabValue, (m: OutboundMessage) => boolean> = {
  all: () => true,
  orders: (m) => m.kind.startsWith("order_"),
  visits: (m) => m.kind.startsWith("visit_"),
  codes: (m) => m.kind === "store_otp",
  failed: (m) => m.status === "failed",
};

// Every SMS and WhatsApp message sent to shop owners and admins, to check what
// someone was told and whether it reached them.
export function Messages() {
  const { plantId } = usePlant();
  const [messages, setMessages] = useState<OutboundMessage[]>([]);
  const [providers, setProviders] = useState<{ sms: string; whatsapp: string } | null>(null);
  const [tab, setTab] = useState<TabValue>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ messages: OutboundMessage[]; providers: { sms: string; whatsapp: string } }>("/api/messages")
      .then((d) => {
        setMessages(d.messages);
        setProviders(d.providers);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load messages"))
      .finally(() => setLoading(false));
  }, [plantId]);

  const visible = useMemo(() => messages.filter(inTab[tab]), [messages, tab]);
  const count = (t: TabValue) => messages.filter(inTab[t]).length;
  const notConnected = providers && (providers.sms === "log" || providers.whatsapp === "log");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="SMS and WhatsApp sent to shop owners and plant admins after orders, visits and new shops."
      />

      {notConnected ? (
        <Notice tone="warn">
          {providers!.sms === "log" && providers!.whatsapp === "log"
            ? "SMS and WhatsApp are not connected yet."
            : providers!.sms === "log"
              ? "SMS is not connected yet."
              : "WhatsApp is not connected yet."}{" "}
          Messages are recorded below as "Not sent" until the accounts are set up.
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      <Card>
        <div className="px-5 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All", count: count("all") },
              { value: "orders", label: "Orders", count: count("orders") },
              { value: "visits", label: "Visits", count: count("visits") },
              { value: "codes", label: "Shop codes", count: count("codes") },
              { value: "failed", label: "Failed", count: count("failed") },
            ]}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>To</Th>
              <Th>Type</Th>
              <Th>Message</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={5}>Loading messages…</MessageRow>}
            {!loading && visible.length === 0 && <MessageRow colSpan={5}>No messages yet.</MessageRow>}
            {!loading &&
              visible.map((m) => (
                <Tr key={m.id}>
                  <Td className="whitespace-nowrap">
                    <div className="text-neutral-800">{formatTime(m.createdAt)}</div>
                    <div className="text-xs text-neutral-500">{formatDate(m.createdAt)}</div>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{m.to}</Td>
                  <Td className="whitespace-nowrap">
                    <div className="text-neutral-800">{KIND_LABEL[m.kind] ?? m.kind}</div>
                    <div className="text-xs text-neutral-500">{m.channel === "sms" ? "SMS" : "WhatsApp"}</div>
                  </Td>
                  <Td className="max-w-md text-[13px] text-neutral-700">{m.body}</Td>
                  <Td className="whitespace-nowrap">
                    {m.status === "sent" ? <Status tone="green">Sent</Status> : null}
                    {m.status === "logged" ? <Status tone="neutral">Not sent</Status> : null}
                    {m.status === "failed" ? (
                      <span title={m.error ?? undefined}>
                        <Status tone="red">Failed</Status>
                      </span>
                    ) : null}
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

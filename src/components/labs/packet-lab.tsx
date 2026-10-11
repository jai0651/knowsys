"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/* One write() of 2,896 bytes from 10.0.0.1 to 10.0.0.2, followed hop by hop
   through the Linux send path, across the wire, up the receive path, and the
   ACK back. The whole run is a deterministic script built from four toggles,
   so the UI is just an index into it and every number can be checked by hand.

   Numbers used throughout: a 1,500-byte MTU, TCP timestamps on, so the TCP
   header is 32 bytes (20 fixed + 12 of options) and the MSS is
   1500 - 20 - 32 = 1,448 bytes. Two segments' worth is 2,896 bytes. */

export type Hdr = "eth" | "ip" | "tcp";
export type Hook = "none" | "OUTPUT" | "POSTROUTING" | "PREROUTING" | "INPUT";
export interface Opts { tso: boolean; wireDrop: boolean; zeroWindow: boolean; hook: Hook }
export interface Seg { hdrs: Hdr[]; payload: number; seq: number; ack: number; win: string; flags: string; rev?: boolean }
export type PktKind = "user" | "skb" | "frame" | "lost" | "ack";
export interface Pkt { kind: PktKind; segs: Seg[]; headroom?: boolean }
export interface Counters { syscalls: number; ctx: number; irqs: number; copies: number; xmits: number }
export type Tone = "drop" | "ok" | "wait";
export interface Step {
  at: string; title: string; text: string; pkt: Pkt;
  focus?: Hdr; tone?: Tone; timer: string; waited: number; c: Counters;
}
export interface Field { name: string; bytes: number; value: string }

export const MSS = 1448;
export const PAYLOAD = 2 * MSS;
export const HDR_BYTES: Record<Hdr, number> = { eth: 14, ip: 20, tcp: 32 };
export const FCS_BYTES = 4;
export const RTO_MS = 200;
export const MAX_ATTEMPTS = 3;
const HDR_ORDER: Hdr[] = ["eth", "ip", "tcp"];
const WIN_TX = "502 ×128 = 64,256 B";
const WIN_RX = "479 ×128 = 61,312 B";
const MAC_A = "02:00:00:00:00:01";
const MAC_B = "02:00:00:00:00:02";

const fmt = (n: number) => n.toLocaleString("en-US");

export function segBytes(s: Seg, fcs = false): number {
  return s.hdrs.reduce((a, h) => a + HDR_BYTES[h], 0) + s.payload + (fcs ? FCS_BYTES : 0);
}

const dataSeg = (seq: number, payload: number, hdrs: Hdr[]): Seg =>
  ({ hdrs, payload, seq, ack: 1, win: WIN_TX, flags: "ACK PSH" });
const ackSeg = (ack: number): Seg =>
  ({ hdrs: ["eth", "ip", "tcp"], payload: 0, seq: 1, ack, win: WIN_RX, flags: "ACK", rev: true });

/* The fields of one header, with the values this packet carries. Sizes are
   the real on-the-wire sizes, so each list sums to HDR_BYTES. */
export function fieldsFor(h: Hdr, s: Seg): Field[] {
  const [sip, dip, sp, dp] = s.rev ? ["10.0.0.2", "10.0.0.1", "8080", "43122"] : ["10.0.0.1", "10.0.0.2", "43122", "8080"];
  if (h === "eth") {
    return [
      { name: "Destination MAC", bytes: 6, value: s.rev ? MAC_A : MAC_B },
      { name: "Source MAC", bytes: 6, value: s.rev ? MAC_B : MAC_A },
      { name: "EtherType", bytes: 2, value: "0x0800 IPv4" },
    ];
  }
  if (h === "ip") {
    const tot = HDR_BYTES.ip + HDR_BYTES.tcp + s.payload;
    return [
      { name: "Ver · IHL", bytes: 1, value: "4 · 5" },
      { name: "DSCP · ECN", bytes: 1, value: "0" },
      { name: "Total length", bytes: 2, value: s.payload > MSS ? `${fmt(tot)} (super-packet)` : fmt(tot) },
      { name: "Identification", bytes: 2, value: "per packet" },
      { name: "Flags · frag offset", bytes: 2, value: "DF · 0" },
      { name: "TTL", bytes: 1, value: "64" },
      { name: "Protocol", bytes: 1, value: "6 TCP" },
      { name: "Header checksum", bytes: 2, value: "software" },
      { name: "Source address", bytes: 4, value: sip },
      { name: "Destination address", bytes: 4, value: dip },
    ];
  }
  return [
    { name: "Source port", bytes: 2, value: sp },
    { name: "Dest port", bytes: 2, value: dp },
    { name: "Sequence number", bytes: 4, value: `${fmt(s.seq)} (relative)` },
    { name: "Ack number", bytes: 4, value: fmt(s.ack) },
    { name: "Offset · flags", bytes: 2, value: `8 words · ${s.flags}` },
    { name: "Window", bytes: 2, value: s.win },
    { name: "Checksum", bytes: 2, value: "offloaded" },
    { name: "Urgent pointer", bytes: 2, value: "0" },
    { name: "Options", bytes: 12, value: "NOP NOP Timestamps" },
  ];
}

/* Lay fields out in 32-bit rows, the way RFC header diagrams do, splitting a
   field across rows when it doesn't fit (the Ethernet MACs are 6 bytes). */
export function layoutRows(fields: Field[], width = 4) {
  const rows: { name: string; value: string; span: number; cont: boolean }[][] = [[]];
  let used = 0;
  for (const f of fields) {
    let left = f.bytes;
    let first = true;
    while (left > 0) {
      if (used === width) { rows.push([]); used = 0; }
      const take = Math.min(left, width - used);
      rows[rows.length - 1].push({ name: f.name, value: f.value, span: take, cont: !first });
      used += take; left -= take; first = false;
    }
  }
  return rows;
}

const HOOK_RULE: Record<Exclude<Hook, "none">, string> = {
  OUTPUT: "iptables -A OUTPUT -p tcp --dport 8080 -j DROP",
  POSTROUTING: "iptables -t mangle -A POSTROUTING -p tcp --dport 8080 -j DROP",
  PREROUTING: "iptables -t raw -A PREROUTING -p tcp --dport 8080 -j DROP",
  INPUT: "iptables -A INPUT -p tcp --dport 8080 -j DROP",
};

export function buildScript(o: Opts): Step[] {
  const out: Step[] = [];
  const c: Counters = { syscalls: 0, ctx: 0, irqs: 0, copies: 0, xmits: 0 };
  let timer = "off";
  let waited = 0;
  const add = (
    at: string, title: string, text: string, pkt: Pkt,
    x: { d?: Partial<Counters>; focus?: Hdr; tone?: Tone; timer?: string; wait?: number } = {},
  ) => {
    if (x.d) for (const k of Object.keys(x.d) as (keyof Counters)[]) c[k] += x.d[k] ?? 0;
    if (x.timer !== undefined) timer = x.timer;
    if (x.wait) waited += x.wait;
    out.push({ at, title, text, pkt, focus: x.focus, tone: x.tone, timer, waited, c: { ...c } });
  };
  const local = o.hook === "OUTPUT" || o.hook === "POSTROUTING";
  const tname = local ? "probe timer" : "RTO";

  add("tx.app", "write(fd, buf, 2896)",
    "Your program on 10.0.0.1 calls `write()` with 2,896 bytes on a TCP connection to 10.0.0.2:8080. The bytes sit in your own memory. That's exactly two full segments: with a 1,500-byte MTU and TCP timestamps on, one segment carries at most 1,448 bytes, the MSS.",
    { kind: "user", segs: [dataSeg(1, PAYLOAD, [])] });
  add("tx.sys", "Into the kernel",
    "The syscall instruction switches the CPU from user mode to kernel mode, on the same thread. That's a mode switch, not a context switch: no other thread runs. `vfs_write` sees that the file is a socket and goes through `sock_write_iter` and `sock_sendmsg` to `tcp_sendmsg`, which takes the socket lock.",
    { kind: "user", segs: [dataSeg(1, PAYLOAD, [])] }, { d: { syscalls: 1 } });
  add("tx.sndbuf", "Copied into an sk_buff",
    "`tcp_sendmsg` copies your 2,896 bytes into an `sk_buff` (skb) on the socket's write queue, charged against the send buffer. This is the one CPU copy on the way out. The skb keeps empty **headroom** in front of the data, so every layer below can add its header with `skb_push()` instead of moving the payload. TCP numbers the bytes now: relative sequence 1 to 2,896.",
    { kind: "skb", segs: [dataSeg(1, PAYLOAD, [])], headroom: true }, { d: { copies: 1 } });

  let viaWrite = true;
  if (o.zeroWindow) {
    viaWrite = false;
    add("tx.tcp", "The window is zero: hold",
      "`tcp_write_xmit` checks two limits before sending anything: the congestion window and the window the receiver last advertised. The receiver's app hasn't been reading, its receive buffer is full, and its last ACK said window 0. So nothing is sent. The skb waits on the write queue and `write()` returns 2,896 anyway, because it only promises that the kernel has your bytes. TCP arms the persist timer.",
      { kind: "skb", segs: [dataSeg(1, PAYLOAD, [])], headroom: true },
      { tone: "wait", timer: "persist timer armed" });
    add("rx.rcvbuf", "A zero-window probe",
      "The persist timer fires and TCP sends a **zero-window probe**, a tiny segment with no new data that makes the receiver repeat its window. The answer is still 0. The timer is set again with a longer timeout, so a closed window can't stall the connection forever without anyone asking.",
      { kind: "skb", segs: [dataSeg(1, PAYLOAD, [])], headroom: true },
      { d: { irqs: 2 }, tone: "wait", timer: "persist timer re-armed" });
    add("rx.app", "The receiver reads, the window opens",
      "On 10.0.0.2 the app finally calls `read()` and drains the old data. That frees the receive buffer, so its TCP sends a **window update**, an ACK whose window is no longer 0, and the app calls `read()` again and sleeps, waiting for our bytes. The update reaches the sender, which cancels the persist timer.",
      { kind: "skb", segs: [dataSeg(1, PAYLOAD, [])], headroom: true },
      { d: { syscalls: 1, copies: 1, irqs: 1 }, timer: "off" });
  }

  let rto = RTO_MS;
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const retx = a > 0;
    const len = retx ? MSS : PAYLOAD;
    const n = len / MSS;
    const whole = (h: Hdr[]): Seg[] => [dataSeg(1, len, h)];
    const cut = (h: Hdr[]): Seg[] => (n === 1 ? whole(h) : [dataSeg(1, MSS, h), dataSeg(1 + MSS, MSS, h)]);
    const skb = (h: Hdr[], split = false): Pkt => ({ kind: "skb", segs: split ? cut(h) : whole(h), headroom: !h.includes("eth") });
    const dropAndMaybeStop = (at: string, title: string, text: string, pkt: Pkt): boolean => {
      add(at, title, text, { ...pkt, kind: "lost" },
        { tone: "drop", timer: `${tname} armed · ≈${fmt(rto)} ms` });
      if (a < MAX_ATTEMPTS - 1) return false;
      add(at, "And so on, until TCP gives up",
        `Each retry meets the same fate, with the timer doubling each time: 200, 400, 800 ms and on. After \`net.ipv4.tcp_retries2\` attempts (15 by default, about 15 minutes in all), TCP gives up and the socket reports an error, typically ETIMEDOUT. Your \`write()\` returned success long before; the error only shows up on a later call.`,
        { ...pkt, kind: "lost" }, { tone: "drop" });
      return true;
    };

    // TCP
    if (!retx) {
      add("tx.tcp", "TCP builds the segment",
        (o.zeroWindow ? "The window update gave TCP room, so this send runs in the softirq that processed the ACK, not in your thread. " : "") +
        "`tcp_write_xmit` finds room in both windows. `tcp_transmit_skb` **clones** the skb, sharing its data rather than copying it, so the original stays on the retransmit queue until it's acknowledged. On the clone it pushes a 32-byte TCP header: 20 fixed bytes and 12 of options (the timestamps). TCP builds one 2,896-byte skb marked with gso_size 1,448 either way; the TSO toggle only decides who cuts it. The RTO timer starts.",
        skb(["tcp"]), { focus: "tcp", timer: `RTO armed · ≈${RTO_MS} ms` });
    } else {
      const waitedFor = rto;
      rto *= 2;
      add("tx.tcp", local ? "The timer fires: try again" : "The RTO fires: retransmit",
        local
          ? `About ${fmt(waitedFor)} ms later the timer fires and TCP tries again from its own queue, sending at most one segment, bytes 1 to 1,448. Your data never left the kernel, so nothing is copied from your program again. The timeout doubles for the next try.`
          : `No ACK arrived within ${fmt(waitedFor)} ms, so \`tcp_retransmit_timer\` runs, in a timer softirq rather than your thread. Linux doubles the RTO and cuts the congestion window to one segment, so \`tcp_retransmit_skb\` resends only bytes 1 to 1,448 from the retransmit queue. No new copy of your data: the bytes never left the kernel.`,
        skb(["tcp"]), { focus: "tcp", wait: waitedFor, timer: `${tname} re-armed · ≈${fmt(rto)} ms` });
    }

    // IP and the output hooks
    add("tx.ip", "IP adds its header",
      "`ip_queue_xmit` uses the route cached on the socket, so there's no full routing-table lookup per packet (the connection's first packet did one). It pushes a 20-byte IPv4 header: TTL 64, protocol 6 for TCP, 10.0.0.1 to 10.0.0.2, Don't Fragment set. `ip_local_out` then hands the packet to netfilter.",
      skb(["tcp", "ip"]), { focus: "ip" });
    if (o.hook === "OUTPUT") {
      if (dropAndMaybeStop("tx.nf", "Dropped at OUTPUT",
        `The rule \`${HOOK_RULE.OUTPUT}\` matches at the OUTPUT hook. The verdict is NF_DROP and the skb is freed. Because the packet was made on this machine, an error (-EPERM) goes back to TCP, which still holds the data in its queue and will try again on a timer. \`write()\` already returned success, so your program hears nothing.`,
        skb(["tcp", "ip"]))) return out;
      continue;
    }
    add("tx.nf", "Netfilter: OUTPUT",
      "The OUTPUT hook (NF_INET_LOCAL_OUT) sees every packet this machine generates. iptables rules in the OUTPUT chain run here, and conntrack, if it's loaded, records the flow. Nothing matches, so the verdict is NF_ACCEPT.",
      skb(["tcp", "ip"]), { focus: "ip" });
    if (o.hook === "POSTROUTING") {
      if (dropAndMaybeStop("tx.nf", "Dropped at POSTROUTING",
        `\`ip_output\` runs the POSTROUTING hook, and \`${HOOK_RULE.POSTROUTING}\` matches. NF_DROP, the skb is freed, and the error goes back to TCP, which still holds the data and will try again on a timer. Your program hears nothing.`,
        skb(["tcp", "ip"]))) return out;
      continue;
    }
    add("tx.nf", "Netfilter: POSTROUTING",
      "`ip_output` runs POSTROUTING (NF_INET_POST_ROUTING), the last hook before the device. Source NAT, such as masquerading, rewrites the source address here when it's configured. Accepted.",
      skb(["tcp", "ip"]), { focus: "ip" });

    add("tx.neigh", "Neighbour: whose MAC?",
      "`ip_finish_output2` asks the neighbour subsystem for the next hop's MAC address. 10.0.0.2 is on the local network and its ARP entry is REACHABLE, so `neigh_output` copies a cached 14-byte Ethernet header in front: destination MAC, source MAC, EtherType 0x0800 for IPv4. With no entry, the packet would wait in a small queue while an ARP request asked who has 10.0.0.2.",
      skb(["tcp", "ip", "eth"]), { focus: "eth" });

    const all: Hdr[] = ["tcp", "ip", "eth"];
    if (n === 1) {
      add("tx.qdisc", "The qdisc",
        "`dev_queue_xmit` puts the skb on the device's **qdisc**, the queue whose policy decides which packet leaves next (often fq_codel). The device is idle, so it's dequeued at once. This skb is a single segment, so there is nothing for TSO or GSO to cut.",
        skb(all), { focus: "eth" });
    } else if (o.tso) {
      add("tx.qdisc", "The qdisc, then a feature check",
        "`dev_queue_xmit` puts the skb on the device's **qdisc**, the queue whose policy decides which packet leaves next (often fq_codel). The device is idle, so it's dequeued at once. `validate_xmit_skb` checks what the card can do: it supports TSO, so the 2,962-byte skb goes to the driver whole.",
        skb(all), { focus: "ip" });
    } else {
      add("tx.qdisc", "The qdisc, then GSO cuts it",
        "`dev_queue_xmit` puts the skb on the device's **qdisc** (often fq_codel), and it's dequeued at once. `validate_xmit_skb` sees the card can't do TSO, so `skb_gso_segment` cuts the skb into two 1,448-byte segments. Each gets its own 66 bytes of headers with the sequence number, IP length and ID fixed up; the payload pages are shared, not copied. That's **GSO**: segmentation in software, done as late as possible.",
        skb(all, true), { focus: "tcp" });
    }

    const nx = n === 1 || o.tso ? 1 : 2;
    add("tx.drv", "Driver: the TX ring",
      `The driver's transmit function maps the skb's memory for DMA, writes descriptors into the **TX ring**${n === 2 && o.tso ? " (including the MSS the card should cut at)" : ""}, and writes the card's doorbell register to say there's work. ${nx === 1 ? "One skb went to the driver." : "It runs twice, once per segment."} ` +
      (a === 0 && viaWrite ? "This is where your thread's work ends: `tcp_sendmsg` returns and `write()` returns 2,896, long before anything reaches 10.0.0.2." : "No thread of yours is involved; this is all softirq work."),
      skb(all, n === 2 && !o.tso), { d: { xmits: nx } });

    const frames: Pkt = { kind: "frame", segs: cut(all) };
    add("tx.nic", n === 2 && o.tso ? "The NIC cuts it: TSO" : "The NIC sends",
      n === 2 && o.tso
        ? "The card reads the skb by DMA. Its TSO engine cuts the payload into two 1,448-byte segments, copies the headers onto each, fixes the sequence numbers, IP lengths and checksums, and appends the 4-byte FCS, a CRC over the frame. Two 1,518-byte frames go out."
        : `The card reads ${n === 2 ? "both segments" : "the segment"} by DMA, fills in the TCP checksum (checksum offload is separate from TSO) and appends the 4-byte FCS, a CRC over the frame. ${n === 2 ? "The same two 1,518-byte frames go out as with TSO: the wire can't tell who cut them." : "One 1,518-byte frame goes out."}`,
      frames);

    if (o.wireDrop && a === 0) {
      add("wire", "Lost on the wire",
        "Interference on the link corrupts both frames. The receiving card's FCS check fails and it discards them silently, so nothing reaches the receiver's kernel and no ACK will come. Only the sender's RTO timer will notice. (Linux would normally send a tail loss probe first, after about two round trips; this lab turns TLP off, as `net.ipv4.tcp_early_retrans=0` does, to show the RTO.) The sender's card still raises a completion interrupt so the driver can free the clone.",
        { ...frames, kind: "lost" }, { d: { irqs: 1 }, tone: "drop", timer: `RTO armed · ≈${fmt(rto)} ms` });
      continue;
    }
    add("wire", "On the wire",
      `${n === 2 ? "Two frames" : "One frame"} on the wire, each 14 + 20 + 32 + 1,448 + 4 = 1,518 bytes. The physical layer adds an 8-byte preamble and a 12-byte gap that never reach memory. The sender's card raises a completion interrupt so the driver can free the transmitted clone; the original stays on the retransmit queue.`,
      frames, { d: { irqs: 1 } });

    // Receive side
    add("rx.nic", "Receiving NIC",
      `The receiving card checks each frame's FCS, strips it, and writes the frame by DMA into an empty buffer from its **RX ring**. No CPU has touched ${n === 2 ? "either frame" : "the frame"} yet.`,
      { kind: "skb", segs: cut(all) });
    add("rx.irq", "One interrupt",
      `The card raises a hard interrupt. The handler does almost nothing: it masks further interrupts from this queue and calls \`napi_schedule\`, which raises the NET_RX softirq.${n === 2 ? " One interrupt covers both frames." : ""}`,
      { kind: "skb", segs: cut(all) }, { d: { irqs: 1 } });
    add("rx.napi", "NAPI poll",
      "`net_rx_action` calls `napi_poll`, which runs the driver's poll function to take frames off the ring in a batch, up to a budget. An XDP program, if one were attached, would see each raw buffer here, before any skb exists. The driver wraps each buffer in an skb, and `eth_type_trans` reads the EtherType and pulls the 14-byte Ethernet header off the front.",
      { kind: "skb", segs: cut(["tcp", "ip"]) }, { focus: "ip" });
    add("rx.gro", n === 2 ? "GRO merges them" : "GRO: nothing to merge",
      n === 2
        ? "`napi_gro_receive` sees two consecutive segments of one flow (same 4-tuple, next sequence number) and merges them into one skb carrying 2,896 bytes. The layers above pay their per-packet cost once instead of twice. GRO only sees frames, so it can't tell whether the sender used TSO or GSO."
        : "`napi_gro_receive` holds packets of the same flow to merge them, but there's only one segment here, so it goes up as it is.",
      { kind: "skb", segs: whole(["tcp", "ip"]) }, { focus: "tcp" });
    add("rx.ip", "ip_rcv checks the header",
      "`__netif_receive_skb` sees EtherType IPv4 and calls `ip_rcv`, which checks the version, the lengths and the header checksum, then runs netfilter's PREROUTING hook.",
      { kind: "skb", segs: whole(["tcp", "ip"]) }, { focus: "ip" });
    if (o.hook === "PREROUTING") {
      if (dropAndMaybeStop("rx.nf", "Dropped at PREROUTING",
        `\`${HOOK_RULE.PREROUTING}\` matches (the filter table has no PREROUTING chain, so the rule lives in raw). NF_DROP, the skb is freed. Nothing goes back to the sender, which just sees no ACK and waits for its RTO.`,
        { kind: "skb", segs: whole(["tcp", "ip"]) })) return out;
      continue;
    }
    add("rx.nf", "Netfilter: PREROUTING",
      "PREROUTING (NF_INET_PRE_ROUTING) sees every arriving packet before any routing decision. conntrack, if loaded, looks the flow up in its table here, and destination NAT would rewrite the address here. Accepted.",
      { kind: "skb", segs: whole(["tcp", "ip"]) }, { focus: "ip" });
    add("rx.ip", "Routing: is it for us?",
      "`ip_rcv_finish` looks up the route for the destination. 10.0.0.2 is one of this machine's own addresses, so the packet is for local delivery, and `ip_local_deliver` passes it to the INPUT hook.",
      { kind: "skb", segs: whole(["tcp", "ip"]) }, { focus: "ip" });
    if (o.hook === "INPUT") {
      if (dropAndMaybeStop("rx.nf", "Dropped at INPUT",
        `\`${HOOK_RULE.INPUT}\` matches at INPUT. NF_DROP, the skb is freed. The sender is told nothing; it only sees that no ACK arrives, and waits for its RTO.`,
        { kind: "skb", segs: whole(["tcp", "ip"]) })) return out;
      continue;
    }
    add("rx.nf", "Netfilter: INPUT",
      "INPUT (NF_INET_LOCAL_IN) runs the rules for traffic addressed to this machine, which is where most host firewalls live. Accepted. `ip_local_deliver_finish` pulls the 20-byte IP header and hands the packet to the handler for protocol 6, TCP.",
      { kind: "skb", segs: whole(["tcp"]) }, { focus: "tcp" });
    add("rx.tcp", "tcp_v4_rcv finds the socket",
      "`tcp_v4_rcv` looks up the socket by the 4-tuple, 10.0.0.1:43122 to 10.0.0.2:8080, and checks that the sequence numbers fall inside the receive window. They do, and the data is the next in order.",
      { kind: "skb", segs: whole(["tcp"]) }, { focus: "tcp" });
    add("rx.rcvbuf", "Queued, and ACKed",
      `TCP pulls the 32-byte header and appends the skb to the socket's receive queue, charged against the receive buffer. That isn't a copy: the payload is still where the card's DMA put it. TCP sends back an ACK, ack ${fmt(1 + len)}, with a window that tells the sender how much room is left.`,
      { kind: "skb", segs: whole([]) });
    add("rx.wake", "Waking the reader",
      "`sk_data_ready` wakes the thread sleeping in `read()`. The scheduler then switches it onto a CPU: a real **context switch**, from whatever was running there to your thread.",
      { kind: "skb", segs: whole([]) }, { d: { ctx: 1 } });
    add("rx.app", `read() returns ${fmt(len)}`,
      `\`tcp_recvmsg\` copies the ${fmt(len)} bytes from the skb into your buffer, the second CPU copy of the trip, and frees the skb. \`read()\` returns ${fmt(len)}.` +
      (n === 1 ? " Only half the data: `read()` returns whatever has arrived, not what was written." : " The `read()` call started long before the data arrived and slept; it's counted once, now that it returns."),
      { kind: "user", segs: whole([]) }, { d: { syscalls: 1, copies: 1 } });

    if (n === 1) {
      add("tx.tcp", "The second segment follows",
        "ACK 1,449 reaches the sender (one interrupt there) and the RTO restarts for what's still outstanding. The congestion window grows to two segments, so TCP sends bytes 1,449 to 2,896 down the same path (one completion interrupt), and the receiver delivers them the same way: one interrupt, one wake-up, one `read()` and one copy.",
        { kind: "frame", segs: [dataSeg(1 + MSS, MSS, all)] },
        { d: { irqs: 3, xmits: 1, ctx: 1, syscalls: 1, copies: 1 }, timer: `RTO armed · ≈${RTO_MS} ms` });
    }
    add("tx.tcp", "The ACK comes home",
      "The ACK, a 66-byte frame with no payload (70 bytes with the FCS), climbs the sender's stack the same way: interrupt, NAPI poll, `ip_rcv`, `tcp_v4_rcv`. `tcp_ack` sees ack 2,897, frees the acknowledged data from the retransmit queue and stops the RTO timer. Every byte of the write is delivered.",
      { kind: "ack", segs: [ackSeg(1 + PAYLOAD)] }, { d: { irqs: 1 }, focus: "tcp", tone: "ok", timer: "stopped" });
    return out;
  }
  return out;
}

/* ---------- view ---------- */

const TX_LAYERS = [
  { id: "tx.app", label: "Your app", sub: "write()" },
  { id: "tx.sys", label: "Syscall boundary", sub: "user → kernel mode" },
  { id: "tx.sndbuf", label: "Socket send buffer", sub: "tcp_sendmsg · sk_buff" },
  { id: "tx.tcp", label: "TCP", sub: "seq · retransmit queue · timers" },
  { id: "tx.ip", label: "IP", sub: "route · ip_queue_xmit" },
  { id: "tx.nf", label: "Netfilter", sub: "OUTPUT · POSTROUTING" },
  { id: "tx.neigh", label: "Neighbour / ARP", sub: "next-hop MAC" },
  { id: "tx.qdisc", label: "qdisc", sub: "dev_queue_xmit · GSO" },
  { id: "tx.drv", label: "Driver · TX ring", sub: "descriptors · doorbell" },
  { id: "tx.nic", label: "NIC", sub: "DMA · TSO · FCS" },
];
const RX_LAYERS = [
  { id: "rx.app", label: "Your app", sub: "read()" },
  { id: "rx.wake", label: "Wake-up", sub: "sk_data_ready · scheduler" },
  { id: "rx.rcvbuf", label: "Socket receive buffer", sub: "receive queue · ACK" },
  { id: "rx.tcp", label: "TCP", sub: "tcp_v4_rcv" },
  { id: "rx.nf", label: "Netfilter", sub: "PREROUTING · INPUT" },
  { id: "rx.ip", label: "IP", sub: "ip_rcv · route" },
  { id: "rx.gro", label: "GRO", sub: "napi_gro_receive" },
  { id: "rx.napi", label: "NAPI poll", sub: "softirq · XDP hook" },
  { id: "rx.irq", label: "Interrupt", sub: "napi_schedule" },
  { id: "rx.nic", label: "NIC", sub: "FCS check · RX ring" },
];

const HDR_STYLE: Record<Hdr, string> = {
  eth: "border-cloud/50 bg-cloud/15 text-cloud",
  ip: "border-dist/50 bg-dist/15 text-dist",
  tcp: "border-os/50 bg-os/15 text-os",
};
const HDR_NAME: Record<Hdr, string> = { eth: "Ethernet", ip: "IPv4", tcp: "TCP" };

function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="rounded bg-[var(--code-bg)] px-1 font-[family-name:var(--font-jetbrains)] text-[0.86em]">{p.slice(1, -1)}</code>
        ) : p.startsWith("**") ? (
          <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Stack({ title, tone, layers, step, visited, hook }: {
  title: string; tone: "os" | "conc"; layers: { id: string; label: string; sub: string }[];
  step: Step; visited: Set<string>; hook: Hook;
}) {
  return (
    <div className={cn("rounded-lg border p-3", tone === "os" ? "border-os/40" : "border-conc/40")}>
      <div className={cn("mb-2 text-[13px] font-semibold", tone === "os" ? "text-os" : "text-conc")}>{title}</div>
      <ol className="space-y-1">
        {layers.map((l) => {
          const cur = step.at === l.id;
          const seen = visited.has(l.id);
          const hookHere = l.id.endsWith(".nf") && hook !== "none" &&
            ((l.id === "tx.nf") === (hook === "OUTPUT" || hook === "POSTROUTING"));
          return (
            <li
              key={l.id}
              aria-current={cur ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1 text-[12.5px]",
                cur
                  ? step.tone === "drop"
                    ? "border-machine bg-machine/15"
                    : tone === "os" ? "border-os bg-os/15" : "border-conc bg-conc/15"
                  : "border-transparent",
              )}
            >
              <span className="w-3 shrink-0 text-center text-ink" aria-hidden>{cur ? (step.tone === "drop" ? "✕" : "▸") : ""}</span>
              <span className={cn("min-w-0 flex-1", cur || seen ? "text-ink" : "text-faint")}>
                <span className="font-medium">{l.label}</span>
                <span className="ml-1.5 font-[family-name:var(--font-jetbrains)] text-[11px] text-faint">{l.sub}</span>
              </span>
              {hookHere && (
                <span className="shrink-0 rounded bg-machine/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-machine">DROP @ {hook}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ByteBar({ seg, pkt }: { seg: Seg; pkt: Pkt }) {
  const lost = pkt.kind === "lost";
  const fcs = pkt.kind === "frame" || pkt.kind === "ack" || (lost && seg.hdrs.includes("eth"));
  const block = "flex flex-none flex-col items-center justify-center rounded border px-1 py-1 leading-tight";
  return (
    <div className={cn("flex items-stretch gap-1 font-[family-name:var(--font-jetbrains)] text-[10.5px]", lost && "opacity-45")}>
      {pkt.headroom && <div className={cn(block, "w-[3.4rem] border-dashed border-line-2 text-faint")}>head-<br />room</div>}
      {HDR_ORDER.filter((h) => seg.hdrs.includes(h)).map((h) => (
        <div key={h} className={cn(block, "w-[3.2rem]", HDR_STYLE[h])}>
          <span className="font-semibold">{h === "eth" ? "Eth" : h.toUpperCase()}</span>
          <span>{HDR_BYTES[h]} B</span>
        </div>
      ))}
      {(seg.payload > 0 || seg.hdrs.length === 0) && (
        <div className={cn(block, "min-w-0 flex-1 border-line-2 bg-surface-2 text-ink")}>
          <span className="font-semibold">data</span>
          <span className="tnum">{fmt(seg.payload)} B</span>
        </div>
      )}
      {seg.payload === 0 && seg.hdrs.length > 0 && <div className="flex-1" />}
      {fcs && <div className={cn(block, "w-[2.6rem] border-machine/40 bg-machine/10 text-machine")}><span className="font-semibold">FCS</span><span>4 B</span></div>}
    </div>
  );
}

const KIND_LABEL: Record<PktKind, string> = {
  user: "in your program's buffer",
  skb: "in kernel memory, described by an sk_buff",
  frame: "frames on the wire",
  lost: "dropped",
  ack: "the ACK frame, coming back",
};

export function PacketLab() {
  const [opts, setOpts] = useState<Opts>({ tso: true, wireDrop: false, zeroWindow: false, hook: "none" });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const script = useMemo(() => buildScript(opts), [opts]);
  const step = script[Math.min(i, script.length - 1)];
  const atEnd = i >= script.length - 1;
  const running = playing && !atEnd;
  const visited = useMemo(() => new Set(script.slice(0, i + 1).map((s) => s.at)), [script, i]);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI((x) => x + 1), 1300);
    return () => clearTimeout(t);
  }, [running, i]);

  const set = (p: Partial<Opts>) => { setOpts((o) => ({ ...o, ...p })); setI(0); setPlaying(false); };
  const seg0 = step.pkt.segs[0];
  const focus = step.focus && seg0?.hdrs.includes(step.focus) ? step.focus : undefined;
  const fcs = step.pkt.kind === "frame" || step.pkt.kind === "ack";
  const total = step.pkt.segs.reduce((a, s) => a + segBytes(s, fcs), 0);
  const onWire = step.at === "wire";

  const toggle = (on: boolean) =>
    cn("rounded-md border px-2.5 py-1 text-[12.5px] transition-colors", on ? "border-machine bg-machine/15 text-ink" : "border-line-2 text-muted hover:text-ink");

  return (
    <div className="my-10 overflow-hidden rounded-xl border border-line bg-surface font-[family-name:var(--font-inter)] shadow-[var(--shadow)] lg:-mx-10">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="mr-auto min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-accent">Lab · one packet, every layer</div>
          <div className="text-[14px] text-muted">
            <code className="rounded bg-[var(--code-bg)] px-1 text-[12.5px]">write()</code> of 2,896 bytes from 10.0.0.1 to 10.0.0.2:8080. Each click moves one hop.
          </div>
        </div>
        <div className="flex rounded-lg border border-line-2 p-0.5 text-[13px]" role="group" aria-label="Segmentation offload">
          {[true, false].map((t) => (
            <button
              key={String(t)}
              onClick={() => set({ tso: t })}
              aria-pressed={opts.tso === t}
              className={cn("rounded-md px-3 py-1.5 transition-colors", opts.tso === t ? "bg-ink text-bg" : "text-muted hover:text-ink")}
            >
              {t ? "TSO on" : "TSO off (GSO)"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Break it</span>
        <button onClick={() => set({ wireDrop: !opts.wireDrop })} aria-pressed={opts.wireDrop} className={toggle(opts.wireDrop)}>Lose it on the wire</button>
        <button onClick={() => set({ zeroWindow: !opts.zeroWindow })} aria-pressed={opts.zeroWindow} className={toggle(opts.zeroWindow)}>Receive buffer full</button>
        <span className="ml-1 text-[12.5px] text-muted">iptables DROP at</span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="iptables DROP hook">
          {(["none", "OUTPUT", "POSTROUTING", "PREROUTING", "INPUT"] as Hook[]).map((h) => (
            <button key={h} onClick={() => set({ hook: h })} aria-pressed={opts.hook === h}
              className={cn(toggle(opts.hook === h && h !== "none"), opts.hook === h && h === "none" && "border-ink text-ink")}>
              {h === "none" ? "no rule" : h}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <div className="order-1">
          <Stack title="Sender · 10.0.0.1" tone="os" layers={TX_LAYERS} step={step} visited={visited} hook={opts.hook} />
        </div>
        <div className="order-3 sm:order-2">
          <Stack title="Receiver · 10.0.0.2" tone="conc" layers={RX_LAYERS} step={step} visited={visited} hook={opts.hook} />
        </div>
        <div className={cn("order-2 flex items-center gap-3 rounded-lg border px-3 py-2 sm:order-3 sm:col-span-2",
          onWire ? (step.tone === "drop" ? "border-machine bg-machine/10" : "border-accent/60 bg-accent/10") : "border-line")}>
          <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">Wire</span>
          <div className="relative flex min-h-[1.9rem] flex-1 items-center justify-center gap-2">
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-2" aria-hidden />
            {onWire ? step.pkt.segs.map((s, k) => (
              <span key={k} className={cn("relative rounded border px-2 py-0.5 font-[family-name:var(--font-jetbrains)] text-[11.5px] tnum",
                step.tone === "drop" ? "border-machine bg-surface text-machine line-through" : "border-accent bg-surface text-ink")}>
                frame {k + 1} · {fmt(segBytes(s, true))} B
              </span>
            )) : step.pkt.kind === "ack" ? (
              <span className="relative rounded border border-data bg-surface px-2 py-0.5 font-[family-name:var(--font-jetbrains)] text-[11.5px] text-data">← ACK 2,897 · 70 B</span>
            ) : (
              <span className="relative bg-surface px-2 text-[12px] text-faint">idle</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 border-t border-line px-5 py-4 md:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">The bytes now</span>
            <span className={cn("text-[12.5px]", step.pkt.kind === "lost" ? "text-machine" : "text-muted")}>
              {KIND_LABEL[step.pkt.kind]} · <span className="tnum">{fmt(total)} B</span>
            </span>
          </div>
          <div className="space-y-1.5">
            {step.pkt.segs.map((s, k) => (
              <div key={k} className="flex items-center gap-2">
                {step.pkt.segs.length > 1 && <span className="w-4 shrink-0 text-[11px] text-faint tnum">{k + 1}</span>}
                <div className="min-w-0 flex-1"><ByteBar seg={s} pkt={step.pkt} /></div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {([
              ["syscalls", step.c.syscalls],
              ["context switches", step.c.ctx],
              ["interrupts", step.c.irqs],
              ["CPU copies", step.c.copies],
              ["skbs to driver", step.c.xmits],
              ["timer waits", `${fmt(step.waited)} ms`],
            ] as [string, number | string][]).map(([k, v]) => (
              <div key={k} className="rounded-md border border-line px-2 py-1.5">
                <div className="tnum font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-none text-ink">{v}</div>
                <div className="mt-1 text-[10.5px] leading-tight text-faint">{k}</div>
              </div>
            ))}
          </div>
          <div className={cn("mt-2 inline-block rounded-full px-2.5 py-1 text-[12px] font-medium",
            step.timer === "off" ? "bg-surface-2 text-muted" : step.timer === "stopped" ? "bg-data/15 text-data" : "bg-ops/15 text-ops")}>
            sender timer: {step.timer}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">
            {focus ? `${HDR_NAME[focus]} header · ${HDR_BYTES[focus]} bytes${step.pkt.segs.length > 1 ? " · segment 1" : ""}` : "Header"}
          </div>
          {focus && seg0 ? (
            <div className="font-[family-name:var(--font-jetbrains)] text-[10.5px]">
              <div className="mb-0.5 grid grid-cols-4 text-center text-faint">
                {[0, 1, 2, 3].map((b) => <span key={b}>byte {b}</span>)}
              </div>
              {layoutRows(fieldsFor(focus, seg0)).map((row, r) => (
                <div key={r} className="grid grid-cols-4 gap-px">
                  {row.map((f, k) => (
                    <div key={k} style={{ gridColumn: `span ${f.span} / span ${f.span}` }}
                      className={cn("mb-px min-w-0 rounded-sm border px-1 py-0.5 leading-tight", HDR_STYLE[focus], f.cont && "opacity-60")}>
                      <div className="truncate font-semibold">{f.cont ? `${f.name} …` : f.name}</div>
                      {!f.cont && <div className="truncate text-ink">{f.value}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[13px] text-muted">
              {step.pkt.kind === "user" ? "Just your bytes: no headers exist yet, or they've all been stripped." : "No header changes at this hop."}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line bg-bg/60 px-5 py-4">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="tnum text-[12px] text-faint">Hop {i + 1} of {script.length}</span>
          <span className={cn("text-[14.5px] font-semibold",
            step.tone === "drop" ? "text-machine" : step.tone === "ok" ? "text-data" : step.tone === "wait" ? "text-ops" : "text-ink")}>
            {step.title}
          </span>
        </div>
        <div className="min-h-[4.8em] text-[14.5px] leading-relaxed text-ink" aria-live="polite">
          <Rich text={step.text} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button onClick={() => { setPlaying(false); setI((x) => Math.max(0, x - 1)); }} disabled={i === 0}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2 disabled:opacity-40">
            Back
          </button>
          <button onClick={() => { setPlaying(false); setI((x) => Math.min(script.length - 1, x + 1)); }} disabled={atEnd}
            className="rounded-lg bg-ink px-4 py-1.5 text-[13.5px] font-medium text-bg disabled:opacity-40">
            Next hop
          </button>
          <button onClick={() => { if (atEnd) { setI(0); setPlaying(true); } else setPlaying((p) => !p); }}
            className="rounded-lg border border-line-2 px-3 py-1.5 text-[13.5px] text-ink hover:bg-surface-2">
            {running ? "Pause" : atEnd ? "Replay" : "Run"}
          </button>
          <button onClick={() => { setPlaying(false); setI(0); }}
            className="text-[13px] text-faint underline decoration-line-2 underline-offset-2 hover:text-ink">
            Reset
          </button>
          <span className="tnum ml-auto text-[12.5px] text-faint">
            {atEnd && step.tone === "ok" ? `Delivered: ${step.c.copies} copies, ${step.c.irqs} interrupts, ${step.c.syscalls} syscalls` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

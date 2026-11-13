/* Learning roadmaps: ordered routes through the chapters.

   One source of truth for /roadmaps. Each stage says what to read (whole
   chapters, or named sections of one), what you can do once it's done (the
   one-line goal on the map), a checkpoint you can actually perform, and what
   to leave unread on the first pass. Inline text supports `code`, **bold** and
   [links](/topics/...). Section ids must match the chapter's SectionHeading
   ids; scripts/check-roadmaps.mjs fails the build if one doesn't. */

export interface Read {
  slug: string;
  /** omit to mean the whole chapter */
  parts?: { id: string; label: string }[];
}

export interface Stage {
  node: string;           // short label under the node on the map
  title: string;
  time: string;
  goal: string;           // the hover card: what you can do afterwards
  read: Read[];
  body: string[];
  checkpoint: string[];
  skip?: string;
  extra?: { href: string; label: string }[];  // labs and projects
}

export interface Route {
  id: string;
  letter: string;
  colour: string;         // a --c-* token
  title: string;
  from: string;           // the chooser card: who it's for
  pitch: string;
  length: string;
  lede: string;
  stages: Stage[];
  total: string;
}

export const ROUTES: Route[] = [
  {
    id: "machine",
    letter: "A",
    colour: "machine",
    title: "Writes backend code → knows what the machine is doing",
    from: "You ship services in Go, Java or Python. Below the language runtime it's a fog.",
    pitch: "Ends when a slow request, a memory graph that won't come down or a dropped packet has an explanation you can check, not a shrug.",
    length: "~7 weeks of evenings",
    lede: "Five stages from the CPU up to containers. You won't read every page of every chapter, and you shouldn't try.",
    stages: [
      {
        node: "Where time goes",
        title: "Where the time in a loop actually goes",
        time: "one week",
        goal: "Predict when the same loop runs 10× slower, and say whether it's the branch predictor or the cache.",
        read: [
          { slug: "01-cpu-architecture", parts: [
            { id: "time-your-cpu", label: "§01 How fast is one core?" },
            { id: "pipeline", label: "§02 The pipeline" },
            { id: "branch-prediction", label: "§03 Branch prediction" },
            { id: "benchmark-traps", label: "§05 Benchmark traps" },
          ] },
          { slug: "02-memory-hierarchy", parts: [
            { id: "time-a-load", label: "§01 Timing the loop" },
            { id: "why-caches", label: "§02 Why caches" },
            { id: "lines", label: "§03 Cache lines" },
            { id: "curve", label: "§05 The whole curve" },
          ] },
        ],
        body: [
          "Start here because almost every performance surprise later on, from a slow hash map to a database that falls off a cliff at some table size, comes back to two facts: the core guesses ahead, and memory is far away. Both chapters open with something you run, so run it. Reading the numbers is not the same as watching 16 KB and 64 MB behave like two different machines on your own laptop.",
          "Don't worry about memorising latencies; you'll probably forget the exact numbers anyway. You want the shape of the curve in your head, roughly where it bends, and why.",
        ],
        checkpoint: [
          "Run the pointer-chasing loop from [chapter 2 §01](/topics/02-memory-hierarchy#time-a-load) at 16 KB, 1 MB and 64 MB. Before you run it, write down how many times slower you think the 64 MB trip will be. If you were off by more than 3×, reread §05.",
          "Then explain, without notes, why sorting an array first can make a loop with an `if` in it run faster even though it does strictly more work.",
        ],
        skip: "Chapter 1 §04 (instruction-level parallelism) and §06–§07 on a first pass, and all of chapter 2 §06 on coherence. Coherence matters a lot, but it'll make sense in roadmap B, when two threads share a line.",
      },
      {
        node: "The kernel",
        title: "Processes, threads, and the cost of asking the kernel",
        time: "one week",
        goal: "Count a program's syscalls and context switches, and say which ones are making it slow.",
        read: [
          { slug: "06-processes-scheduling" },
          { slug: "07-syscalls-kernel-boundary", parts: [
            { id: "feel-it", label: "§01 A million small writes" },
            { id: "boundary", label: "§02 Why there's a border" },
            { id: "crossing", label: "§03 Inside one write()" },
            { id: "batching", label: "§05 Making fewer trips" },
            { id: "operating", label: "§08 Counting your crossings" },
          ] },
        ],
        body: [
          "Your service is a process the kernel schedules, and every read, write, accept and sleep is a request to the kernel. This stage is about knowing what those requests cost, because the fix for \"it's slow and the CPU isn't busy\" is usually somewhere in here.",
          "Read chapter 6 whole. In chapter 7, the parts on interrupts and signals are good but can wait.",
        ],
        checkpoint: [
          "Pick a program you use daily and run it under `strace -c` (Linux) or `dtruss` (macOS). Name its three most frequent syscalls and guess why each happens that often.",
          "Explain why a million 1-byte `write()` calls take orders of magnitude longer than one 1 MB write, and what `BufWriter`/`bufio`/`BufferedWriter` changes. [Chapter 7 §05](/topics/07-syscalls-kernel-boundary#batching) has the numbers if you get stuck.",
        ],
        skip: "Chapter 7 §06–§07 (interrupts, signals). Come back to signals the first time a process ignores your Ctrl-C.",
      },
      {
        node: "Memory",
        title: "Virtual memory, and why RSS lies to you",
        time: "one week",
        goal: "Read a process's memory numbers and say which ones are real, and why freeing memory didn't shrink it.",
        read: [
          { slug: "04-virtual-memory", parts: [
            { id: "ask-for-4gb", label: "§01 Asking for 4 GB" },
            { id: "why-virtual-memory", label: "§02 Why translate" },
            { id: "page-tables", label: "§03 Page tables" },
            { id: "tlb", label: "§04 The TLB" },
            { id: "first-touch", label: "§05 First touch" },
            { id: "fork-cow", label: "§06 fork and copy-on-write" },
          ] },
          { slug: "05-allocators", parts: [
            { id: "why-an-allocator", label: "§02 Why an allocator" },
            { id: "malloc-path", label: "§04 One malloc call" },
            { id: "rss", label: "§05 Why RSS never comes down" },
            { id: "choosing", label: "§08 Choosing an allocator" },
          ] },
        ],
        body: [
          "Most \"memory leak\" tickets aren't leaks. They're a process that touched memory once and an allocator that kept it, or a graph showing virtual size when someone meant resident size. Chapter 4 explains what the numbers mean; chapter 5 explains why they don't go back down.",
          "The fork and copy-on-write section is the one people skip and later wish they hadn't, because it explains why Redis snapshots can double memory use for a moment.",
        ],
        checkpoint: [
          "Allocate 4 GB in a small program without touching it, and watch RSS in `top`. Then touch every page and watch again. Explain the difference in one sentence.",
          "A Python service frees a big list but its RSS stays at 3 GB. Give two explanations from [chapter 5 §05](/topics/05-allocators#rss) and say how you'd tell which one it is.",
        ],
        skip: "Chapter 4 §07–§09 (huge pages, TLB pressure) unless you run databases or JVMs with big heaps. Chapter 5 §03, the build-your-own-allocator walk, is fun but optional.",
      },
      {
        node: "Disk & network",
        title: "Files, the page cache, and a packet's way in",
        time: "two weeks of evenings",
        goal: "Write a file so a crash can't corrupt it, and say where on its way in a packet can be dropped.",
        read: [
          { slug: "08-filesystems", parts: [
            { id: "name-to-blocks", label: "§01 From a name to blocks" },
            { id: "page-cache", label: "§02 The page cache" },
            { id: "writes", label: "§03 Writing through memory" },
            { id: "safe-replace", label: "§04 Replacing a file safely" },
            { id: "failure", label: "§06 When the layers fail" },
          ] },
          { slug: "10-linux-networking", parts: [
            { id: "stream-and-datagrams", label: "§01 What read() hands you" },
            { id: "wire-to-memory", label: "§02 Wire to memory" },
            { id: "climbing-the-stack", label: "§03 Up the stack" },
            { id: "waking-your-thread", label: "§04 Waking your thread" },
            { id: "drops", label: "§05 When a queue is full" },
            { id: "send-path", label: "§07 The way back out" },
          ] },
        ],
        body: [
          "Two chapters, one idea in both: the kernel puts a layer of memory between your program and the device, and that layer is why things are fast and why things get lost. `write()` returning doesn't mean the data is on disk. A packet reaching the machine doesn't mean your program will ever see it.",
          "This is probably the longest stage. Chapter 10 is 40 minutes of dense reading, so give it two sittings, maybe three.",
        ],
        checkpoint: [
          "Write down, in order, the calls that replace a config file so that a power cut at any moment leaves either the old file or the new one, never half of each. Check your list against [chapter 8 §04](/topics/08-filesystems#safe-replace). Most people forget the last step.",
          "Name three places between the network card and your `recv()` where a packet can be dropped, and one counter you'd look at for each.",
        ],
        skip: "Chapter 9 (block devices and SSDs) entirely for now; it's worth it once you run databases. Chapter 10 §06 and §08 (multi-core scaling, kernel bypass) unless you're working on a proxy or load balancer.",
      },
      {
        node: "Containers",
        title: "A container is a process with three things done to it",
        time: "one week",
        goal: "Build a container by hand from namespaces, a root filesystem and cgroups, and explain what each one stops.",
        read: [
          { slug: "11-containers" },
        ],
        body: [
          "Everything in the earlier stages comes together here: processes (stage 2), memory limits (stage 3), filesystems and network interfaces (stage 4). A container isn't a small VM. It's an ordinary process the kernel lies to in three specific ways, and once you've built one yourself, \"the container got OOM-killed\" stops being mysterious.",
        ],
        checkpoint: [
          "Follow [chapter 11 §05](/topics/11-containers#assemble) and run a shell in its own PID, mount and network namespaces with a memory limit. Inside it, run `ps` and explain why you see so few processes.",
          "Then set the memory limit to 50 MB, allocate 100 MB, and explain who killed the process and how you'd find that out from outside.",
        ],
        skip: "§07 on user namespaces on a first pass. Chapter 12 (systemd) is a good follow-up but not part of this route.",
        extra: [{ href: "/projects/container-runtime", label: "Project: Docker, from scratch" }],
      },
    ],
    total: "**Total: about 7 weeks of evenings.** Nine chapters, most of them read in part. From here, roadmap B goes sideways into threads, roadmap C goes up into databases.",
  },
  {
    id: "concurrency",
    letter: "B",
    colour: "conc",
    title: "Uses threads → can reason about concurrent code",
    from: "You've used a mutex and an `async` function. You couldn't say why the counter came out wrong.",
    pitch: "Ends when you can look at shared state and say what can interleave, what a lock costs under contention, and why p99 blew up at 80% CPU.",
    length: "~5 weeks of evenings",
    lede: "Four stages. Do roadmap A's first stage before this one, or at least chapter 2 §01–§03, because cache lines show up everywhere here.",
    stages: [
      {
        node: "The race",
        title: "Why count++ isn't one step",
        time: "one week",
        goal: "Show a lost update on purpose, fix it two ways, and say why it hid on x86 and showed up on ARM.",
        read: [
          { slug: "13-locks", parts: [
            { id: "lost-update", label: "§01 The lost update" },
            { id: "building-a-lock", label: "§02 Building a lock" },
            { id: "futex-word", label: "§03 One integer, three states" },
            { id: "contract", label: "§05 What a mutex promises" },
            { id: "failure", label: "§06 Deadlock, inversion, convoys" },
          ] },
          { slug: "03-memory-model-atomics", parts: [
            { id: "lose-increments", label: "§01 Two threads, one counter" },
            { id: "reordering", label: "§02 Reordering" },
            { id: "publication", label: "§03 Publishing with a flag" },
            { id: "x86-vs-arm", label: "§06 Why x86 hides the bug" },
          ] },
        ],
        body: [
          "Locks first, then the memory model. That's the reverse of the chapter numbers, on purpose: the lock chapter gives you the bug and the fix, and the memory model chapter then explains why a fix that \"looked fine\" on your laptop broke on a Graviton box.",
        ],
        checkpoint: [
          "Run two threads that each increment a shared integer a million times. Get a wrong answer, then fix it with a mutex and again with an atomic, and time both.",
          "Explain in a paragraph why setting a `ready` flag after writing data can still let another thread see the flag before the data, and what one keyword or ordering fixes it.",
        ],
        skip: "Chapter 3 §04–§05 (the formal orderings and what they compile to). Come back when you write lock-free code, not before.",
        extra: [{ href: "/labs/lock-lab", label: "Lab: Lock Lab" }],
      },
      {
        node: "Models",
        title: "Threads, event loops, async and goroutines",
        time: "one week",
        goal: "Pick a concurrency model for a service that mostly waits, and defend it with numbers.",
        read: [
          { slug: "15-concurrency-models" },
        ],
        body: [
          "One chapter, read whole. Every model in it is a different answer to the same problem: a request spends most of its life waiting on the network, and you don't want a whole thread sitting idle for it. Once you see that, the arguments online about async versus threads get a lot less heated.",
        ],
        checkpoint: [
          "A service handles 10,000 concurrent requests, each waiting 200 ms on a database. Work out what thread-per-request costs in stack memory alone, and say what changes with an event loop and with goroutines.",
          "Name the one thing that will stall an event loop that a thread pool shrugs off.",
        ],
      },
      {
        node: "Contention",
        title: "Queueing, contention and the tail",
        time: "one week",
        goal: "Explain why p99 goes vertical at 80% utilisation, and use Little's Law to size a worker pool.",
        read: [
          { slug: "16-contention-tail-latency" },
          { slug: "13-locks", parts: [
            { id: "cost", label: "§07 What a lock costs" },
            { id: "operating", label: "§08 Finding the hurting lock" },
          ] },
        ],
        body: [
          "For anyone running services, this is probably the most useful stage in the route. The maths is light (one law and one curve), and once it clicks, you'll stop being surprised that a box at 85% CPU is slow and a box at 60% isn't.",
        ],
        checkpoint: [
          "A service sees 2,000 requests a second and each one takes 25 ms. How many are in flight at once? Then: if service time doubles, what happens to the queue at 80% utilisation? Use [chapter 16 §03–§04](/topics/16-contention-tail-latency#utilisation).",
          "Explain why a request that fans out to 100 backends sees the backends' p99 as its own median.",
        ],
        extra: [{ href: "/labs/queueing-lab", label: "Lab: Queueing Lab" }],
      },
      {
        node: "Shared data",
        title: "Sharing data without one big lock",
        time: "one to two weeks",
        goal: "Choose between one lock, striping, sharding per core and lock-free for a hot shared map.",
        read: [
          { slug: "17-concurrent-data-structures" },
          { slug: "14-lock-free", parts: [
            { id: "holder", label: "§01 The weak spot in a lock" },
            { id: "cas", label: "§02 Compare-and-swap" },
            { id: "progress", label: "§04 What lock-free promises" },
            { id: "why-collapse", label: "§06 Why retry loops collapse" },
            { id: "choosing", label: "§08 Choosing" },
          ] },
          { slug: "02-memory-hierarchy", parts: [{ id: "coherence", label: "§06 When two cores share a line" }] },
        ],
        body: [
          "Now the coherence section from roadmap A pays off. False sharing, where two threads write different variables that happen to sit on one cache line, explains a lot of \"we added cores and it got slower\".",
          "Lock-free is in here, but read it to know when not to use it. Chapter 14 is upfront that it rarely buys you throughput.",
        ],
        checkpoint: [
          "A counter map is hit by 32 threads. Sketch three designs from [chapter 17](/topics/17-concurrent-data-structures) and say which one you'd ship and what would make you switch.",
          "Explain what compare-and-swap does in one sentence, and why a CAS loop under heavy contention can be slower than a mutex.",
        ],
        skip: "Chapter 14 §07 (ABA, memory reclamation) unless you're actually writing a lock-free structure. Most people never should.",
      },
    ],
    total: "**Total: about 5 weeks of evenings.** Six chapters. Roadmap D (distributed systems) is the same questions with a network in the middle.",
  },
  {
    id: "data",
    letter: "C",
    colour: "data",
    title: "Uses a database → knows how it works inside",
    from: "You write SQL, use Redis as a cache and publish to Kafka. What happens after the call returns is someone else's problem.",
    pitch: "Ends when you can say why a query is slow from its plan, which isolation level stops which bug, and what a Kafka partition key decides.",
    length: "~8 weeks of evenings",
    lede: "Five stages, from bytes on a page up to logs and streams. This is the route the system design case studies lean on hardest.",
    stages: [
      {
        node: "Storage engine",
        title: "Pages, B+trees, the WAL and LSM trees",
        time: "one to two weeks",
        goal: "Say what happens on disk when you INSERT a row, and when you'd pick an LSM tree over a B+tree.",
        read: [
          { slug: "18-storage-engines" },
        ],
        body: [
          "Fifty minutes of reading, and more or less the foundation for everything after it. Every database in the case studies, from Postgres to Cassandra to the thing under Kafka, is one of the two designs in this chapter, or a mix.",
        ],
        checkpoint: [
          "Explain why a B+tree with 4 KB pages finds one row among a billion in about four page reads, and which of those reads are probably already in memory.",
          "A workload is 95% writes with random keys. Argue for B+tree or LSM using [§07](/topics/18-storage-engines#choosing), and name the price you pay for your choice.",
        ],
        extra: [{ href: "/labs/storage-lab", label: "Lab: Storage Engine Lab" }],
      },
      {
        node: "Transactions",
        title: "What a transaction promises, and the bugs it doesn't stop",
        time: "one week",
        goal: "Name the anomaly behind a bug report and the isolation level that prevents it, in Postgres and MySQL.",
        read: [
          { slug: "19-transactions-isolation" },
        ],
        body: [
          "Read the whole chapter. Lost updates and write skew are behind a surprising share of real money bugs, and the default isolation level in most databases allows at least one of them. The bank example runs through the whole chapter, so don't skip ahead.",
        ],
        checkpoint: [
          "Reproduce the overdraft write skew from [§07](/topics/19-transactions-isolation#write-skew) in two `psql` sessions under the default level. Then fix it twice: once with `SELECT ... FOR UPDATE`, once with `SERIALIZABLE`, and say what each costs.",
        ],
        extra: [{ href: "/labs/mvcc-lab", label: "Lab: MVCC Lab" }],
      },
      {
        node: "Queries & Postgres",
        title: "Reading a query plan, and Postgres from the inside",
        time: "two weeks of evenings",
        goal: "Read EXPLAIN ANALYZE, find the bad row estimate, and know why Postgres needs VACUUM.",
        read: [
          { slug: "20-query-execution", parts: [
            { id: "ask-for-the-plan", label: "§01 Ask for the plan" },
            { id: "access-paths", label: "§04 Reading one table" },
            { id: "joins", label: "§05 Joins" },
            { id: "costing", label: "§06 Costing" },
            { id: "estimates", label: "§07 Row estimates" },
            { id: "operating", label: "§10 Reading plans on a Monday" },
          ] },
          { slug: "21-postgres", parts: [
            { id: "where-a-row-lives", label: "§01 Where a row lives" },
            { id: "update-three-times", label: "§02 One row, three updates" },
            { id: "mvcc", label: "§03 Who sees which version" },
            { id: "hot", label: "§04 HOT updates" },
            { id: "vacuum", label: "§05 Vacuum" },
            { id: "replication", label: "§09 Replication" },
          ] },
        ],
        body: [
          "Chapter 20 teaches you to read what the planner chose; chapter 21 explains the engine underneath the most common database you'll meet. Section 4 of chapter 21, on why every index has to change when a row moves, is the same story as Uber's 2016 move from Postgres to MySQL in [chapter 50](/topics/50-design-uber#dd-trip-db).",
        ],
        checkpoint: [
          "Take one slow query from work (or the examples in chapter 20) and run `EXPLAIN (ANALYZE, BUFFERS)`. Find the node where estimated and actual rows differ by more than 10×, and say what statistic is wrong.",
          "Explain why a table that's updated constantly but never grows in row count can still grow on disk.",
        ],
        skip: "Chapter 20 §08–§09 (join ordering, prepared plans) and chapter 21 §06–§07 (wraparound, TOAST) until you operate Postgres yourself.",
      },
      {
        node: "Caching & Redis",
        title: "Caches, done properly, and Redis inside",
        time: "one to two weeks",
        goal: "Design a cache for a hot read: pattern, TTL, eviction, and what happens the instant the key expires.",
        read: [
          { slug: "25-caching", parts: [
            { id: "what-a-cache-buys", label: "§02 What a hit rate is worth" },
            { id: "patterns", label: "§03 Patterns" },
            { id: "eviction", label: "§04 Eviction" },
            { id: "expiry", label: "§07 Expiry" },
            { id: "stampedes", label: "§08 Stampedes" },
            { id: "invalidation", label: "§09 Invalidation" },
          ] },
          { slug: "22-redis", parts: [
            { id: "one-thread", label: "§01 One thread" },
            { id: "guarantees", label: "§03 What one thread guarantees" },
            { id: "key-cost", label: "§06 What one key costs" },
            { id: "eviction-expiry", label: "§07 Eviction and expiry" },
            { id: "durability", label: "§08 Durability" },
          ] },
        ],
        body: [
          "Caching is where interview answers go vague (\"put Redis in front of it\"), so this stage is about the specific questions: who fills the cache, what happens on a write, how long a copy may live, and what stops a thousand requests from hitting the database the moment a hot key expires.",
        ],
        checkpoint: [
          "Design the cache for a product page read 50,000 times a second and edited a few times a day. Say which pattern from [chapter 25 §03](/topics/25-caching#patterns), what TTL, and exactly how you stop a stampede when it expires.",
          "Work out roughly how much memory 10 million small Redis keys take using [chapter 22 §06](/topics/22-redis#key-cost).",
        ],
        skip: "Chapter 25 §05–§06 (W-TinyLFU and policy comparisons) are great, but they're for when you're building a cache, not using one.",
        extra: [
          { href: "/labs/cache-lab", label: "Lab: Cache Eviction Lab" },
          { href: "/projects/redis-clone", label: "Project: a Redis clone" },
        ],
      },
      {
        node: "Logs & streams",
        title: "Kafka, and computing over streams",
        time: "two weeks of evenings",
        goal: "Pick a partition key, explain consumer groups and offsets, and say what 'exactly once' really means.",
        read: [
          { slug: "23-kafka-logs", parts: [
            { id: "toy-log", label: "§01 A toy log" },
            { id: "partitions", label: "§02 Partitions and keys" },
            { id: "replication", label: "§05 Replication" },
            { id: "consumers", label: "§08 Consumer groups" },
            { id: "exactly-once", label: "§09 Exactly-once" },
            { id: "retention", label: "§10 Retention" },
          ] },
          { slug: "61-stream-processing", parts: [
            { id: "batch-vs-stream", label: "§01 Batch vs stream" },
            { id: "event-time", label: "§02 Event time" },
            { id: "windows", label: "§03 Windows" },
            { id: "watermarks", label: "§04 Watermarks" },
            { id: "state", label: "§06 State" },
            { id: "checkpoints", label: "§07 Checkpoints" },
          ] },
        ],
        body: [
          "Kafka shows up in nearly every case study, usually with one sentence of justification. After this stage you'll be able to write the paragraph instead: why a log and not a queue, what the partition key decides, and what breaks when one partition gets all the traffic.",
        ],
        checkpoint: [
          "Choose a partition key for an orders topic where per-customer order must hold, and say what happens when one customer is a marketplace seller with 40% of all orders.",
          "Explain watermarks to someone in three sentences, using a ride that's reported two minutes late as the example.",
        ],
        skip: "Chapter 23 §07, §11 (page cache, KRaft) and chapter 61 §10–§11 (stream joins, lambda vs kappa) on a first pass. Chapter 24 (columnar) and chapter 62 (search) are separate topics; read them when you need them.",
      },
    ],
    total: "**Total: about 8 weeks of evenings.** Eight chapters, mostly in part. Next: roadmap D, where every one of these gets copied across machines.",
  },
  {
    id: "distributed",
    letter: "D",
    colour: "dist",
    title: "Runs one database → understands distributed systems",
    from: "Your system has replicas and a queue. When a node dies, you hope.",
    pitch: "Ends when you can say what a replica can promise a reader, how keys find their owner, why Raft needs a majority, and how a checkout stays correct across two services.",
    length: "~9 weeks of evenings",
    lede: "Five stages. Assumes roadmap C or the equivalent, because almost every chapter here starts from a single database and asks what changes with two.",
    stages: [
      {
        node: "Time",
        title: "Why you can't order events by timestamp",
        time: "one week",
        goal: "Explain why two servers' timestamps can't order their writes, and what Lamport clocks and leases do instead.",
        read: [
          { slug: "26-time-and-ordering", parts: [
            { id: "your-clocks", label: "§01 Two clocks" },
            { id: "ntp", label: "§04 NTP" },
            { id: "cart-by-timestamp", label: "§05 The cart, by timestamp" },
            { id: "lamport", label: "§06 Lamport clocks" },
            { id: "vector-clocks", label: "§07 Vector clocks" },
            { id: "leases", label: "§10 Leases and fencing" },
          ] },
        ],
        body: [
          "Distributed systems start here because the first instinct, \"just use the timestamp\", is wrong in a way that only shows up under load. The cart example in §05 is the one to take your time over.",
        ],
        checkpoint: [
          "Two replicas' clocks differ by 300 ms. Walk through how last-write-wins loses an item from the cart in [§05](/topics/26-time-and-ordering#cart-by-timestamp), then show the same two writes with vector clocks and say what the system now knows that it didn't.",
          "Explain why a lock with a timeout isn't safe without a fencing token.",
        ],
        skip: "§02–§03 on Linux clocks, and §08–§09 (hybrid logical clocks, TrueTime) until a case study needs them. Spanner's TrueTime comes up in the Uber case study.",
      },
      {
        node: "Replication",
        title: "Copies, lag, and what a reader can be promised",
        time: "one week",
        goal: "Name the consistency model a feature needs and pick a replication setup that delivers it.",
        read: [
          { slug: "28-replication-consistency" },
        ],
        body: [
          "One chapter, read whole. It sorts the vocabulary (linearisable, read-your-writes, eventual) by asking what a single user would notice, and that framing is what you'll use in every design discussion after this.",
        ],
        checkpoint: [
          "A user changes their profile photo, reloads, and sees the old one. Name the guarantee that broke, and give two fixes with different costs.",
          "With N = 3, explain why R = 2 and W = 2 guarantees a read sees the latest write, and what goes wrong with sloppy quorums.",
        ],
      },
      {
        node: "Partitioning",
        title: "Giving every key an owner",
        time: "one week",
        goal: "Choose hash or range partitioning for a workload, survive adding a node, and deal with a hot key.",
        read: [
          { slug: "29-partitioning" },
        ],
        body: [
          "Every case study has a line like \"shard by user_id\". This chapter is the reasoning behind that line, including the two places it hurts: queries that don't use the partition key, and the one key everyone wants.",
        ],
        checkpoint: [
          "Add a fifth node to a four-node hash ring. What fraction of keys move, and why is it so much less than with `hash(key) % N`? Check it in the Consistent Hashing Lab.",
          "A celebrity's posts all hash to one shard. Give two fixes from [§06](/topics/29-partitioning#hot) and the cost of each.",
        ],
        skip: "§04 (jump hash, rendezvous) on a first pass.",
        extra: [{ href: "/labs/hashing-lab", label: "Lab: Consistent Hashing Lab" }],
      },
      {
        node: "Consensus",
        title: "Raft, majorities, and deciding who's dead",
        time: "two weeks of evenings",
        goal: "Explain why a 5-node Raft cluster survives two failures and stalls instead of guessing on the third.",
        read: [
          { slug: "27-consensus", parts: [
            { id: "order", label: "§01 Why copies need an order" },
            { id: "quorums", label: "§02 Quorums" },
            { id: "kill-the-leader", label: "§03 Kill the leader" },
            { id: "safety-liveness", label: "§04 Safety and liveness" },
            { id: "election", label: "§05 Elections" },
            { id: "replication", label: "§06 Copying the log" },
            { id: "reads", label: "§11 Reads" },
          ] },
          { slug: "30-failure-detection", parts: [
            { id: "impossible", label: "§02 Why silence can't be explained" },
            { id: "timeouts", label: "§03 Heartbeats and timeouts" },
            { id: "gossip", label: "§07 Gossip and SWIM" },
            { id: "split-brain", label: "§08 Split brain" },
          ] },
        ],
        body: [
          "The hardest stage in the route, and the one most worth doing slowly. Use the Raft Lab alongside chapter 27: killing a leader and watching the election is worth more than any amount of reading about it.",
        ],
        checkpoint: [
          "In the Raft Lab, partition a 5-node cluster 3–2. Predict which side keeps accepting writes before you look, then explain why the other side can't, even though it has a leader that thinks it's fine.",
          "Explain why a failure detector can never be sure a node is dead, and what Raft does about that.",
        ],
        skip: "Chapter 27 §07–§10 (figure 8, membership changes, pre-vote, Paxos) unless you're implementing consensus.",
        extra: [
          { href: "/labs/raft-lab", label: "Lab: Raft Lab" },
          { href: "/projects/raft-kv", label: "Project: a replicated KV store with Raft" },
        ],
      },
      {
        node: "Across services",
        title: "Transactions across services, and across regions",
        time: "two weeks of evenings",
        goal: "Keep a checkout correct across an orders service and a payments service, and choose between active-passive and active-active.",
        read: [
          { slug: "31-distributed-transactions" },
          { slug: "76-multi-region", parts: [
            { id: "one-region", label: "§01 What one region can't do" },
            { id: "active-passive", label: "§03 Active-passive" },
            { id: "failover", label: "§04 Failing over" },
            { id: "active-active", label: "§05 Active-active" },
            { id: "home-region", label: "§06 One home per list" },
            { id: "choosing", label: "§12 Choosing a design" },
          ] },
        ],
        body: [
          "Chapter 31 is the most directly useful chapter in this route for day-to-day backend work. The outbox and idempotency keys come up in nearly every payment, order or booking design, and in every interview about them.",
        ],
        checkpoint: [
          "Design the checkout from [chapter 31 §01](/topics/31-distributed-transactions#crash-between-writes) so a crash at any line can't leave a charge with no order. Use an outbox and an idempotency key, and say where each lives.",
          "Say which of your company's data could be active-active and which must have one home region, and why.",
        ],
        skip: "Chapter 76 §08–§09 (last-writer-wins, CRDTs) unless you're building collaborative editing; the Figma and Notion case studies use them.",
      },
    ],
    total: "**Total: about 9 weeks of evenings.** Seven chapters and two labs. After this, the case studies read as applications of things you already know, and that's the idea.",
  },
  {
    id: "production",
    letter: "E",
    colour: "cloud",
    title: "Ships code → runs it in production",
    from: "Your code deploys to Kubernetes or Lambda behind a load balancer. When it pages at 3 am, you're not sure where to look.",
    pitch: "Ends when you can trace a request from DNS to a pod, read a latency histogram honestly, set an SLO, and size a fleet.",
    length: "~8 weeks of evenings",
    lede: "Five stages, in the order a request meets them, then the tools for keeping it healthy.",
    stages: [
      {
        node: "The way in",
        title: "DNS, TLS, the edge and the load balancer",
        time: "one to two weeks",
        goal: "Trace a request from a domain name to one backend, and say what each hop can cache, decide or break.",
        read: [
          { slug: "35-dns-tls-edge", parts: [
            { id: "dns", label: "§01 DNS" },
            { id: "dns-cache", label: "§02 DNS caching" },
            { id: "anycast", label: "§05 Anycast" },
            { id: "tls", label: "§06 The TLS handshake" },
            { id: "cdn-cache-keys", label: "§08 The edge cache" },
          ] },
          { slug: "34-load-balancing" },
        ],
        body: [
          "Most outages that \"weren't our code\" happen somewhere in this stage: a DNS TTL nobody remembered, a certificate that expired, a health check that marked every backend dead at once.",
        ],
        checkpoint: [
          "Run `dig +trace` on your company's domain and explain every step of the output.",
          "A deploy restarts half the backends and users see errors for 30 seconds. Explain what draining in [chapter 34 §06](/topics/34-load-balancing#draining) would have changed, and which health check setting probably made it worse.",
        ],
        skip: "Chapter 35 §03–§04 (stub resolvers, DNS wire format) and §07 on certificate chains, until you're debugging one.",
      },
      {
        node: "Network & IAM",
        title: "The private network, and who may call what",
        time: "one week",
        goal: "Draw your VPC's packet path between zones, and read an IAM policy and say exactly what it allows.",
        read: [
          { slug: "33-vpc-networking", parts: [
            { id: "cidr-arithmetic", label: "§01 Addresses" },
            { id: "pieces", label: "§03 Routes and security groups" },
            { id: "packet-path", label: "§04 One packet, A to B" },
            { id: "silent-failures", label: "§06 Silent failures" },
            { id: "cost", label: "§07 What it costs" },
          ] },
          { slug: "37-iam-security-boundary", parts: [
            { id: "the-request", label: "§01 What AWS sees" },
            { id: "ask-for-decisions", label: "§02 Two rules" },
            { id: "policy-grammar", label: "§03 Policy documents" },
            { id: "evaluation", label: "§05 Evaluation" },
            { id: "sts", label: "§07 STS" },
            { id: "least-privilege", label: "§09 Least privilege" },
          ] },
        ],
        body: [
          "Two chapters about boundaries: which packets may cross, and which calls may. Both fail silently, a timeout instead of an error, an AccessDenied with no reason, and both are much easier with the mental model than with the console.",
        ],
        checkpoint: [
          "Explain why traffic between two availability zones shows up on the bill, and one design change that cuts it.",
          "Given an IAM policy with an `Allow` on `s3:*` and an SCP with a `Deny` on `s3:DeleteObject`, say what a `DeleteObject` call gets and why, using [chapter 37 §05](/topics/37-iam-security-boundary#evaluation).",
        ],
        skip: "Chapter 37 §06, §08, §10 (cross-account, IMDS, confused deputy) unless you're in a security role. Read §10 eventually, though.",
      },
      {
        node: "Compute",
        title: "VMs, functions, and how Kubernetes actually works",
        time: "two weeks of evenings",
        goal: "Explain a cold start, and follow one kubectl apply from the API server to a running process.",
        read: [
          { slug: "36-compute-abstractions", parts: [
            { id: "ladder", label: "§02 The ladder" },
            { id: "lambda-lifecycle", label: "§03 A function call" },
            { id: "cold-starts", label: "§04 Cold starts" },
            { id: "pod-placement", label: "§07 Pod placement" },
          ] },
          { slug: "60-kubernetes-internals", parts: [
            { id: "one-apply", label: "§01 One apply" },
            { id: "api-server", label: "§02 The API server" },
            { id: "etcd", label: "§03 etcd" },
            { id: "watch", label: "§04 List and watch" },
            { id: "reconcile", label: "§05 Reconciling" },
            { id: "scheduling", label: "§08 Choosing a node" },
            { id: "kubelet", label: "§09 The kubelet" },
            { id: "networking", label: "§10 Networking" },
          ] },
        ],
        body: [
          "Kubernetes is 60 minutes of reading and you'll likely want two sittings. Its core idea, a loop that compares what you asked for with what exists and fixes the difference, is simple, and almost every confusing Kubernetes behaviour follows from it.",
        ],
        checkpoint: [
          "Run `kubectl apply` on a deployment and list, in order, every component that acts before the container starts. Check it against [chapter 60 §01](/topics/60-kubernetes-internals#one-apply).",
          "A Lambda's p99 is 2 seconds and its p50 is 40 ms. Say what's in the 2 seconds and two ways to shrink it.",
        ],
        skip: "Chapter 36 §05, §08 and chapter 60 §06–§07, §11–§12 until you run clusters yourself.",
      },
      {
        node: "Seeing it",
        title: "Metrics, traces, and finding where the time went",
        time: "two weeks of evenings",
        goal: "Read a latency histogram honestly, avoid a cardinality explosion, and find a hot function with a flame graph.",
        read: [
          { slug: "39-observability" },
          { slug: "41-performance-engineering", parts: [
            { id: "goal", label: "§02 What faster means" },
            { id: "on-off-cpu", label: "§03 Running or waiting" },
            { id: "use-red", label: "§04 USE and RED" },
            { id: "flame-graphs", label: "§06 Flame graphs" },
            { id: "benchmarks", label: "§08 Benchmarks" },
            { id: "operating", label: "§11 A slow service" },
          ] },
        ],
        body: [
          "If you only do one stage of this route, make it this one. Averages hide the requests that matter, labels can quietly multiply a metrics bill by a thousand, and a flame graph answers in a minute what an afternoon of guessing doesn't.",
        ],
        checkpoint: [
          "Explain why you can't average p99s across instances, and what you do instead with histogram buckets ([chapter 39 §06](/topics/39-observability#histograms)).",
          "Profile one real service with a sampling profiler, find its widest frame, and decide whether the time is on-CPU or waiting.",
        ],
        skip: "Chapter 41 §07 (CPU counters) and §09 unless you're tuning hot loops.",
      },
      {
        node: "Keeping it up",
        title: "SLOs, retries, overload, and capacity",
        time: "one to two weeks",
        goal: "Set an SLO and error budget, configure retries that don't make an outage worse, and size a fleet with headroom.",
        read: [
          { slug: "40-reliability" },
          { slug: "42-queueing-and-capacity", parts: [
            { id: "check-littles-law", label: "§01 Requests in flight" },
            { id: "sizing", label: "§03 Sizing a fleet" },
            { id: "headroom", label: "§04 Headroom" },
            { id: "autoscalers", label: "§05 Autoscalers" },
            { id: "dependencies", label: "§08 What doesn't autoscale" },
          ] },
        ],
        body: [
          "Retries are the classic way a small outage becomes a big one, and chapter 40 has the arithmetic. Pair it with chapter 42's sizing method, which is the same Little's Law from roadmap B, used on a fleet.",
        ],
        checkpoint: [
          "Three services each retry 3 times on failure. Work out how many requests hit the bottom service when it starts failing, then fix it with a retry budget and jitter.",
          "Size a fleet for 12,000 requests a second at 40 ms each, with an instance that handles 64 concurrent requests, and say how much headroom you'd add and why.",
        ],
        extra: [{ href: "/labs/queueing-lab", label: "Lab: Queueing Lab" }],
      },
    ],
    total: "**Total: about 8 weeks of evenings.** Ten chapters. Chapter 12 (systemd) and chapter 47 (virtualization) are good next reads if you run your own machines.",
  },
  {
    id: "interview",
    letter: "F",
    colour: "cases",
    title: "System design interview in a month",
    from: "You mostly know this and have an interview in four weeks.",
    pitch: "Shorter and denser. The method, the building blocks that get asked about, ten case studies in order of how often they come up, then daily practice.",
    length: "~4 weeks",
    lede: "Five stages. If stage 2 feels like new material instead of revision, do roadmaps C and D first, because a month isn't enough to learn them from zero.",
    stages: [
      {
        node: "Method",
        title: "How the interview is scored, and a method to run",
        time: "three evenings",
        goal: "Run a 45-minute design in a fixed order, and turn a one-line prompt into numbers that change a decision.",
        read: [
          { slug: "43-interview-systems", parts: [
            { id: "find-the-hard-part", label: "§01 Find the hard part" },
            { id: "what-is-scored", label: "§02 What's scored" },
            { id: "shape", label: "§03 Spending 45 minutes" },
            { id: "estimation", label: "§04 Estimation" },
            { id: "high-level", label: "§05 The high-level design" },
            { id: "deep-dives", label: "§06 Going deep" },
          ] },
          { slug: "38-system-design-method" },
        ],
        body: [
          "Start with how you're judged, then the method. Most people fail these interviews on time management and on never finding the one hard part of the problem, not on missing knowledge, and chapter 43 is blunt about that.",
        ],
        checkpoint: [
          "Set a 5-minute timer and estimate QPS, storage per day and peak bandwidth for a chat service with 50 million daily users, the way [chapter 38 §04](/topics/38-system-design-method#estimate) does. If one of your numbers would change a design decision, say which.",
        ],
      },
      {
        node: "Building blocks",
        title: "The building blocks every answer uses",
        time: "one week",
        goal: "Justify a cache, a queue, a shard key and a consistency level in two sentences each, without hand-waving.",
        read: [
          { slug: "25-caching", parts: [
            { id: "patterns", label: "§03 Patterns" },
            { id: "expiry", label: "§07 Expiry" },
            { id: "stampedes", label: "§08 Stampedes" },
          ] },
          { slug: "23-kafka-logs", parts: [
            { id: "partitions", label: "§02 Partitions and keys" },
            { id: "consumers", label: "§08 Consumer groups" },
          ] },
          { slug: "29-partitioning", parts: [
            { id: "key-owner", label: "§01 Key owners" },
            { id: "ring", label: "§03 The ring" },
            { id: "hot", label: "§06 Hot keys" },
            { id: "secondary", label: "§07 Secondary indexes" },
          ] },
          { slug: "28-replication-consistency", parts: [
            { id: "models", label: "§03 Consistency models" },
            { id: "choosing", label: "§07 Choosing" },
          ] },
          { slug: "31-distributed-transactions", parts: [
            { id: "outbox", label: "§05 Outbox" },
            { id: "idempotency", label: "§06 Idempotency keys" },
          ] },
        ],
        body: [
          "Revision, mostly, not first reading. These sections are where follow-up questions land: \"what happens when the cache key expires?\", \"what's your partition key?\", \"what if the payment succeeds and the order insert fails?\"",
        ],
        checkpoint: [
          "Without notes, answer each in two sentences: why Kafka and not a queue; what stops a cache stampede; how you query by a field that isn't the shard key; how an idempotency key works end to end.",
        ],
      },
      {
        node: "Core cases",
        title: "The five case studies that come up most",
        time: "one week",
        goal: "Redraw five classic designs from a blank page, with the database, queue, cache and indexes for each.",
        read: [
          { slug: "65-design-twitter" },
          { slug: "49-design-whatsapp" },
          { slug: "50-design-uber" },
          { slug: "67-design-ticketmaster" },
          { slug: "52-design-stripe" },
        ],
        body: [
          "Feed fan-out, chat delivery, geospatial matching, contention on a scarce resource, and money that must not double. Between them they probably cover most of what gets asked. Read each one, then close it and redraw the final design from memory before moving on.",
          "Open the engineering boxes this time. They're where the database choices, schemas and partition keys live.",
        ],
        checkpoint: [
          "For each of the five, on a blank page in 15 minutes: the final diagram, the primary database and why, one index you'd create, and the one hard part. Compare against the chapter's \"whole system\" section.",
        ],
      },
      {
        node: "Breadth",
        title: "Five more, for range",
        time: "one week",
        goal: "Recognise which known design a new prompt is closest to, and say what's different.",
        read: [
          { slug: "51-design-youtube" },
          { slug: "66-design-dropbox" },
          { slug: "68-design-discord" },
          { slug: "56-design-job-scheduler" },
          { slug: "54-design-chatgpt" },
        ],
        body: [
          "Video upload and delivery, file sync, a chat system at a different scale from WhatsApp, a scheduler, and an LLM product. Read these faster than stage 3, and focus on what each does differently from the five you already know.",
          "If you've got time left, [Zomato](/topics/77-design-zomato), [Amazon checkout](/topics/72-design-amazon) and [Google Maps](/topics/55-design-google-maps) are the next most common prompts.",
        ],
        checkpoint: [
          "For each, write one line: \"this is like ___ except ___\". If you can't fill in the blank, reread that chapter's requirements section.",
        ],
      },
      {
        node: "Drill",
        title: "Practise out loud until the interview",
        time: "45 minutes a day",
        goal: "Run a full mock in 45 minutes, out loud, and know where your answers still go vague.",
        read: [
          { slug: "43-interview-systems", parts: [
            { id: "systems-questions", label: "§07 Systems questions" },
            { id: "levels", label: "§08 Seniority" },
            { id: "failure-modes", label: "§09 Why good engineers fail" },
            { id: "practice", label: "§10 How to practise" },
          ] },
        ],
        body: [
          "One case study a day from a blank page, out loud, with a timer. Then open the chapter and check the interview questions at its end; those are the follow-ups you'll get. A friend asking \"why?\" after every box helps more than another chapter would.",
        ],
        checkpoint: [
          "A full 45-minute mock with someone else asking the questions. If you can't find a person, record yourself and listen back. It's painful, and it works.",
        ],
      },
    ],
    total: "**Total: about 4 weeks**, assuming the building blocks are revision. If stage 2 takes longer than a week, you want roadmaps C and D first.",
  },
];

/* Chapters no roadmap sends you to, and when they're worth reading. */
export const OFF_ROUTE: { slug: string; when: string }[] = [
  { slug: "09-storage-devices", when: "when you run databases, or a disk benchmark makes no sense" },
  { slug: "12-systemd", when: "when you run services on your own Linux machines" },
  { slug: "24-columnar-analytics", when: "when you work on analytics, ClickHouse, DuckDB or Parquet" },
  { slug: "62-search-engines", when: "when you build search, or Elasticsearch is misbehaving" },
  { slug: "63-rpc-grpc-quic", when: "when you pick between REST, gRPC and HTTP/3, or debug one" },
  { slug: "32-object-storage-s3", when: "when S3 is in your design, which is most of the time" },
  { slug: "44-speculative-execution", when: "when you want to know where the mitigation tax comes from" },
  { slug: "45-gpu-architecture", when: "when you work anywhere near ML infrastructure" },
  { slug: "46-linking-loading", when: "when a binary won't start, or you wonder why Go builds are static" },
  { slug: "47-virtualization", when: "when you care what's under your EC2 instance or Firecracker" },
  { slug: "48-ebpf", when: "when you want to observe a production kernel without rebooting it" },
  { slug: "59-distributed-training", when: "when you train models across many GPUs" },
];

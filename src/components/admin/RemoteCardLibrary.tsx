import { createSignal, For, onCleanup, Show } from "solid-js";
import styles from "./RemoteCardLibrary.module.scss";

type ImportedStatus = "draft" | "active" | "archived" | null;

type RemoteCard = {
  id: string;
  name: string;
  setName: string;
  setCode: string;
  number: string;
  typeLine: string;
  rarity: string;
  image: string | null;
  referencePriceLabel: string;
  importedStatus: ImportedStatus;
};

type RemoteCardLibraryProps = {
  title: string;
  description: string;
  badge: string;
  endpoint: string;
  gameName: string;
  cardPlaceholder: string;
  setPlaceholder: string;
  artworkNote?: string;
  onImported: () => unknown;
};

export default function RemoteCardLibrary(props: RemoteCardLibraryProps) {
  const [query, setQuery] = createSignal("");
  const [searchBy, setSearchBy] = createSignal<"card" | "set">("card");
  const [matchedSets, setMatchedSets] = createSignal<string[]>([]);
  const [cards, setCards] = createSignal<RemoteCard[]>([]);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [importing, setImporting] = createSignal<Set<string>>(new Set());
  const [searching, setSearching] = createSignal(false);
  const [bulkRunning, setBulkRunning] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let searchController: AbortController | undefined;

  onCleanup(() => searchController?.abort());

  const selectableCards = () => cards().filter(card => !card.importedStatus);

  const resetResults = () => {
    searchController?.abort();
    setCards([]);
    setMatchedSets([]);
    setSelected(new Set<string>());
    setMessage("");
  };

  const searchCards = async (event: SubmitEvent) => {
    event.preventDefault();
    const value = query().trim();
    if (!value) {
      setMessage(`Enter a ${searchBy() === "set" ? "set" : "card"} name first.`);
      return;
    }

    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    setSearching(true);
    setMessage("");
    setSelected(new Set<string>());
    try {
      const response = await fetch(
        `${props.endpoint}?by=${searchBy()}&q=${encodeURIComponent(value)}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        cards?: RemoteCard[];
        matchedSets?: string[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(result.error ?? `${props.gameName} could not be searched.`);
        return;
      }
      setCards(result.cards ?? []);
      setMatchedSets(result.matchedSets ?? []);
      if (!result.cards?.length) setMessage(`No matching ${props.gameName} cards found.`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(`${props.gameName} could not be searched. Check the connection and try again.`);
      }
    } finally {
      if (searchController === controller) setSearching(false);
    }
  };

  const importCard = async (card: RemoteCard) => {
    const response = await fetch(props.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      variants?: number;
      hasImage?: boolean;
    };
    if (response.ok) {
      setCards(previous => previous.map(item =>
        item.id === card.id ? { ...item, importedStatus: "draft" } : item,
      ));
    }
    return { ok: response.ok, ...result };
  };

  const addCard = async (card: RemoteCard) => {
    setImporting(previous => new Set(previous).add(card.id));
    setMessage("");
    try {
      const result = await importCard(card);
      if (!result.ok) {
        setMessage(result.error ?? `${card.name} could not be added.`);
        return;
      }
      setMessage(
        `${card.name} added as a zero-stock draft with ${result.variants ?? 1} variant${(result.variants ?? 1) === 1 ? "" : "s"}.${
          result.hasImage === false ? " Add artwork before publishing." : ""
        }`,
      );
      await props.onImported();
    } catch {
      setMessage(`${card.name} could not be added. Check the connection and try again.`);
    } finally {
      setImporting(previous => {
        const next = new Set(previous);
        next.delete(card.id);
        return next;
      });
    }
  };

  const toggleCard = (cardId: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleAll = () => {
    const selectable = selectableCards();
    setSelected(previous =>
      previous.size === selectable.length
        ? new Set<string>()
        : new Set<string>(selectable.map(card => card.id)),
    );
  };

  const runBulkImport = async () => {
    const chosen = selected().size
      ? cards().filter(card => selected().has(card.id))
      : searchBy() === "set" ? selectableCards() : [];
    if (!chosen.length) return;

    setBulkRunning(true);
    let added = 0;
    let withoutArt = 0;
    const failed: string[] = [];

    for (const [index, card] of chosen.entries()) {
      setMessage(`Adding ${index + 1} of ${chosen.length}: ${card.name}`);
      setImporting(previous => new Set(previous).add(card.id));
      try {
        const result = await importCard(card);
        if (result.ok) {
          added += 1;
          if (result.hasImage === false) withoutArt += 1;
        } else {
          failed.push(`${card.name} (${result.error ?? "failed"})`);
        }
      } catch {
        failed.push(`${card.name} (network error)`);
      } finally {
        setImporting(previous => {
          const next = new Set(previous);
          next.delete(card.id);
          return next;
        });
      }
    }

    setSelected(new Set<string>());
    setBulkRunning(false);
    setMessage(
      [
        `Added ${added} of ${chosen.length} cards as zero-stock drafts.`,
        withoutArt ? `${withoutArt} need artwork before publishing.` : "",
        failed.length
          ? `Skipped: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? ` and ${failed.length - 3} more` : ""}.`
          : "",
      ].filter(Boolean).join(" "),
    );
    await props.onImported();
  };

  return (
    <section class={styles.library}>
      <div class={styles.head}>
        <div>
          <h2>{props.title}</h2>
          <p>{props.description}</p>
          <Show when={props.artworkNote}>
            <small>{props.artworkNote}</small>
          </Show>
        </div>
        <span>{props.badge}</span>
      </div>

      <form class={styles.search} onSubmit={searchCards}>
        <label class={styles.mode}>
          <span>Search by</span>
          <select
            value={searchBy()}
            onChange={event => {
              setSearchBy(event.currentTarget.value as "card" | "set");
              resetResults();
            }}
          >
            <option value="card">Card name or number</option>
            <option value="set">Set name or code</option>
          </select>
        </label>
        <label>
          <span>{searchBy() === "set" ? "Set" : "Card"}</span>
          <input
            type="search"
            value={query()}
            onInput={event => setQuery(event.currentTarget.value)}
            placeholder={searchBy() === "set" ? props.setPlaceholder : props.cardPlaceholder}
          />
        </label>
        <button type="submit" disabled={searching() || bulkRunning()}>
          {searching() ? "Searching" : searchBy() === "set" ? "Find set" : "Find cards"}
        </button>
      </form>

      <Show when={matchedSets().length}>
        <p class={styles.setMatch}>
          Set{matchedSets().length === 1 ? "" : "s"}: {matchedSets().join(", ")}
        </p>
      </Show>

      <Show when={message()}>
        <p class={styles.message} role="status">{message()}</p>
      </Show>

      <Show when={selectableCards().length}>
        <div class={styles.bulkBar}>
          <label>
            <input
              type="checkbox"
              checked={selected().size > 0 && selected().size === selectableCards().length}
              onChange={toggleAll}
            />
            <span>Select all {selectableCards().length}</span>
          </label>
          <button
            type="button"
            disabled={bulkRunning() || (!selected().size && searchBy() !== "set")}
            onClick={() => void runBulkImport()}
          >
            {bulkRunning()
              ? "Adding cards..."
              : selected().size
                ? `Import ${selected().size} selected as drafts`
                : searchBy() === "set"
                  ? `Import all ${selectableCards().length} cards as drafts`
                  : "Select cards to import"}
          </button>
        </div>
      </Show>

      <Show when={cards().length}>
        <div class={styles.results}>
          <For each={cards()}>
            {card => (
              <article classList={{ [styles.picked]: selected().has(card.id) }}>
                <div class={styles.visual}>
                  <Show when={card.image} fallback={<span>{card.setCode}</span>}>
                    {image => <img src={image()} alt="" loading="lazy" />}
                  </Show>
                  <Show when={!card.importedStatus}>
                    <label class={styles.pick}>
                      <input
                        type="checkbox"
                        checked={selected().has(card.id)}
                        disabled={bulkRunning()}
                        onChange={() => toggleCard(card.id)}
                        aria-label={`Select ${card.name}`}
                      />
                    </label>
                  </Show>
                </div>
                <div class={styles.info}>
                  <strong>{card.name}</strong>
                  <span>{card.typeLine || props.gameName}</span>
                  <small>{card.setName} ({card.setCode}) · {card.number} · {card.rarity}</small>
                </div>
                <div class={styles.price}>
                  <span>Reference</span>
                  <strong>{card.referencePriceLabel}</strong>
                </div>
                <button
                  type="button"
                  disabled={Boolean(card.importedStatus) || importing().has(card.id)}
                  onClick={() => void addCard(card)}
                >
                  {card.importedStatus
                    ? card.importedStatus === "active" ? "Live" : "Already added"
                    : importing().has(card.id) ? "Adding card" : "Add as draft"}
                </button>
              </article>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

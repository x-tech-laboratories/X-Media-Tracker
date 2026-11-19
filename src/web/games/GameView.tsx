// One game's page: its cover, status, rating, the platforms a copy is owned on, edition, playtime, last day played and
// collections, the game it is DLC of or its own DLC, what the catalogues say of it with links to each, and the review.

// ── Imports ──────────────────────────────────────────────────────────────────

import { useState } from "react";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { CommitInput, DateTimeField, NumberField } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog, Dialog, open_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Facts, FormRow, PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { MediaGrid, MediaTile } from "@x-tech-laboratories/x-libs/web/react/media";
import { Rating } from "@x-tech-laboratories/x-libs/web/react/rating";
import { RichText } from "@x-tech-laboratories/x-libs/web/react/rich_text";
import { ComboField } from "@x-tech-laboratories/x-libs/web/react/suggestions";
import { Empty, Loaded } from "@x-tech-laboratories/x-libs/web/react/states";

import { calls, use_data } from "../api.ts";
import { HistoryButton } from "../history/HistoryView.tsx";
import {
  common_platforms,
  dlc_of,
  find_base_game,
  game_links,
  game_status_labels,
  is_dlc,
  type GameCollection,
  type GameIds,
  type LibraryGame,
} from "../../shared/games/model.ts";
import { attempt, game_href, set_game_status } from "./actions.tsx";
import { HeadPoster, use_cover } from "../covers.tsx";
import { MergeButton } from "../merging.tsx";
import { game_merge } from "./merge.tsx";
import { StatusPicker } from "./StatusPicker.tsx";

// ── Owning ───────────────────────────────────────────────────────────────────

function Platforms({ game, known }: { game: LibraryGame; known: string[] }) {
  const suggestions = [...new Set([...common_platforms, ...known])];
  return (
    <ChipField
      label="Owned on"
      values={game.owned_platforms}
      suggestions={suggestions}
      list_on_focus
      add_label="Add"
      placeholder="Add a platform, such as PC"
      on_change={(next) => attempt(calls().set_game_platforms(game.id, next))}
    />
  );
}

function Collections({ game, collections }: { game: LibraryGame; collections: GameCollection[] }) {
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const chosen = game.collection_ids.map((id) => names.get(id)).filter((name): name is string => !!name);
  // A name not yet a collection is made one.
  const save = async (next: string[]) => {
    const ids = await Promise.all(next.map((name) => collections.find((collection) => collection.name.toLowerCase() === name.toLowerCase())?.id ?? calls().save_game_collection({ name })));
    await calls().set_game_collections(game.id, ids);
  };
  return <ChipField label="Collections" values={chosen} suggestions={collections.map((collection) => collection.name)} list_on_focus add_label="Add" placeholder="Add to a collection" on_change={(next) => attempt(save(next))} />;
}

// Kept in minutes, shown and typed in hours.
function Playtime({ game }: { game: LibraryGame }) {
  const hours = game.playtime_minutes ? Math.round((game.playtime_minutes / 60) * 10) / 10 : null;
  return <NumberField label="Playtime" bare unit="hours" min={0} step={0.5} value={hours} on_change={(value) => attempt(calls().set_game_playtime(game.id, Math.round((value ?? 0) * 60)))} />;
}

// ── Ids ──────────────────────────────────────────────────────────────────────

const id_fields: [keyof GameIds, string, string][] = [
  ["rawg_id", "RAWG", "A game's slug, such as portal-2, or its link"],
  ["mobygames_id", "MobyGames", "A game's number, such as 51233, or its link"],
  ["giantbomb_id", "Giant Bomb", "A game's guid, such as 3030-21662, or its link"],
  ["wikidata_id", "Wikidata", "An item, such as Q279446, or its link"],
  ["steam_app_id", "Steam", "An app's number, such as 620, or its store link"],
  ["igdb_id", "IGDB", "A game's slug, such as portal-2, or its link"],
];

function IdsDialog({ game, close }: { game: LibraryGame; close: () => void }) {
  const [ids, set_ids] = useState<GameIds>({
    rawg_id: game.rawg_id,
    mobygames_id: game.mobygames_id,
    giantbomb_id: game.giantbomb_id,
    wikidata_id: game.wikidata_id,
    steam_app_id: game.steam_app_id,
    igdb_id: game.igdb_id,
  });
  const [busy, set_busy] = useState(false);
  return (
    <Dialog
      title="Change ids"
      subtitle={game.title}
      on_close={close}
      form={{
        submit_label: busy ? "Saving…" : "Save",
        on_submit: (event) => {
          event.preventDefault();
          set_busy(true);
          attempt(
            calls()
              .set_game_ids(game.id, ids)
              .then(close)
              .finally(() => set_busy(false)),
          );
        },
      }}
    >
      {id_fields.map(([key, label, hint]) => (
        <FormRow key={key} label={label} id={`game-${key}`} hint={hint}>
          <input id={`game-${key}`} autoComplete="off" spellCheck={false} value={ids[key]} onChange={(event) => set_ids({ ...ids, [key]: event.currentTarget.value })} />
        </FormRow>
      ))}
    </Dialog>
  );
}

// ── DLC ──────────────────────────────────────────────────────────────────────

// Each game named by its title, with its year where two share one.
function game_names(games: LibraryGame[]): Map<string, LibraryGame> {
  const names = new Map<string, LibraryGame>();
  for (const game of games) {
    const twin = games.some((other) => other !== game && other.title.toLowerCase() === game.title.toLowerCase());
    names.set(twin && game.year ? `${game.title} (${game.year})` : game.title, game);
  }
  return names;
}

function BaseGameDialog({ game, games, close }: { game: LibraryGame; games: LibraryGame[]; close: () => void }) {
  const names = game_names(games.filter((each) => each.id !== game.id && !is_dlc(each)));
  const current = find_base_game(game, games);
  const [name, set_name] = useState(current ? ([...names].find(([, each]) => each.id === current.id)?.[0] ?? "") : "");
  const chosen = names.get(name.trim());
  return (
    <Dialog
      title="DLC of"
      subtitle={game.title}
      on_close={close}
      form={{
        submit_label: name.trim() && !chosen ? "Pick a game" : "Save",
        on_submit: (event) => {
          event.preventDefault();
          if (name.trim() && !chosen) return;
          attempt(calls().set_game_base(game.id, chosen?.id ?? "").then(close));
        },
      }}
    >
      <FormRow label="Base game" id="game-base" hint="The game in your library this adds to; leave empty if it is not DLC.">
        <ComboField id="game-base" label="Base game" value={name} options={[...names.keys()]} list_on_focus limit={20} placeholder="Type a title" on_change={set_name} />
      </FormRow>
    </Dialog>
  );
}

// The game this is DLC of: a link when it is tracked, else the name a catalogue gave.
function BaseGame({ game, games }: { game: LibraryGame; games: LibraryGame[] }) {
  const base = find_base_game(game, games);
  return (
    <span className="game-base">
      {base ? <a href={game_href(base.id)}>{base.title}</a> : is_dlc(game) ? game.base_game_title || game.base_game : "Not DLC"}
      <button type="button" className="link" onClick={() => open_dialog((close) => <BaseGameDialog game={game} games={games} close={close} />)}>
        Change
      </button>
    </span>
  );
}

function DlcTile({ game }: { game: LibraryGame }) {
  const image = use_cover(game.cover_file, game.cover_url);
  return <MediaTile title={game.title} href={game_href(game.id)} image={image} lines={[game.year, game_status_labels[game.status]].filter(Boolean)} />;
}

function DlcList({ dlc }: { dlc: LibraryGame[] }) {
  return (
    <Section title="DLC">
      <MediaGrid>
        {dlc.map((each) => (
          <DlcTile key={each.id} game={each} />
        ))}
      </MediaGrid>
    </Section>
  );
}

// ── Review ───────────────────────────────────────────────────────────────────

// Saved once the field is left, so each keystroke is not a change in History.
function Review({ game }: { game: LibraryGame }) {
  const [text, set_text] = useState(game.review);
  return (
    <Section title="Review">
      <RichText label="Review" placeholder="What did you think?" value={text} on_change={set_text} on_blur={() => text.trim() !== game.review && attempt(calls().set_game_review(game.id, text))} />
    </Section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function GamePage({ game, games, collections, known_platforms }: { game: LibraryGame; games: LibraryGame[]; collections: GameCollection[]; known_platforms: string[] }) {
  const remove = () =>
    confirm_dialog({
      title: `Remove ${game.title}?`,
      message: "Its rating, review and playtime go with it; History can bring it back.",
      confirm_label: "Remove",
      danger: true,
      run: async () => {
        await calls().remove_game(game.id);
        window.location.hash = "#/games";
      },
    });

  const links = game_links(game);
  const dlc = dlc_of(game, games);
  return (
    <Stack>
      <PageHeading
        title={game.title}
        subtitle={[game.developers, game.year].filter(Boolean).join(" · ")}
        actions={
          <>
            <HistoryButton kind="game" item_id={game.id} name={game.title} />
            <button type="button" onClick={() => open_dialog((close) => <IdsDialog game={game} close={close} />)}>
              Change ids
            </button>
            <MergeButton kind={game_merge} start={game} items={games} />
            <button type="button" className="danger" onClick={remove}>
              Remove
            </button>
          </>
        }
      />
      <div className="title-head">
        <HeadPoster file={game.cover_file} address={game.cover_url} />
        <div className="title-facts">
          {/* What is yours to set, one control a row, so the wide ones never crowd each other. */}
          <Facts
            layout="rows"
            rows={[
              ["Status", <StatusPicker status={game.status} on_change={(status) => set_game_status(game, status)} />],
              ["Rating", <Rating label="Rating" max={10} value={game.rating} on_change={(rating) => attempt(calls().set_game_rating(game.id, rating))} />],
              [
                "Playtime",
                <span className="game-play">
                  <Playtime game={game} />
                  <DateTimeField label="Last played" allow_time={false} value={game.last_played || null} on_change={(day) => attempt(calls().set_game_last_played(game.id, day ?? ""))} />
                </span>,
              ],
              [
                "Edition",
                <CommitInput
                  aria-label="Edition"
                  placeholder="Such as Game of the Year Edition"
                  value={game.edition}
                  on_commit={(event) => event.currentTarget.value.trim() !== game.edition && attempt(calls().set_game_edition(game.id, event.currentTarget.value))}
                />,
              ],
              ["Owned on", <Platforms game={game} known={known_platforms} />],
              ["Collections", <Collections game={game} collections={collections} />],
              ["DLC of", <BaseGame game={game} games={games} />],
            ]}
          />
          <Facts
            rows={[
              !!game.release_date && ["Released", game.release_date],
              !game.release_date && !!game.year && ["Released", game.year],
              !!game.genres && ["Genres", game.genres],
              !!game.platforms && ["Platforms", game.platforms],
              !!game.developers && ["Developers", game.developers],
              !!game.publishers && ["Publishers", game.publishers],
              !!game.added_at && ["Added", game.added_at],
              links.length > 0 && [
                "Links",
                <span className="game-links">
                  {links.map((link) => (
                    <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
                      {link.label}
                    </a>
                  ))}
                </span>,
              ],
            ]}
          />
          {game.overview && <p className="title-overview">{game.overview}</p>}
        </div>
      </div>
      {dlc.length > 0 && <DlcList dlc={dlc} />}
      <Review key={game.id} game={game} />
    </Stack>
  );
}

export function GameView({ id }: { id: string }) {
  const game = use_data((api) => api.get_game(id), [id]);
  const library = use_data((api) => api.list_games());
  return (
    <div className="game-page">
      <Loaded resource={game} empty={<Empty title="That game is not in the library." hint={<a href="#/games">Back to Games</a>} />}>
        {(loaded) =>
          loaded && (
            <Loaded resource={library}>
              {(all) => <GamePage game={loaded} games={all.games} collections={all.collections} known_platforms={[...new Set(all.games.flatMap((each) => each.owned_platforms))]} />}
            </Loaded>
          )
        }
      </Loaded>
    </div>
  );
}

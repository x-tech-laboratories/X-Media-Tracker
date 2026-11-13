// One title's page: its poster, status, rating, collections and TMDB's overview and cast, and for a show every season's
// episodes to tick off, one at a time or a season or the whole show at once.

// ── Imports ──────────────────────────────────────────────────────────────────

import { Avatar } from "@x-tech-laboratories/x-libs/web/react/media";
import { ChipField } from "@x-tech-laboratories/x-libs/web/react/chip_field";
import { Select } from "@x-tech-laboratories/x-libs/web/react/controls";
import { confirm_dialog } from "@x-tech-laboratories/x-libs/web/react/dialog";
import { Facts, PageHeading, Section, Stack } from "@x-tech-laboratories/x-libs/web/react/layout";
import { ProgressBar } from "@x-tech-laboratories/x-libs/web/react/progress";
import { Rating } from "@x-tech-laboratories/x-libs/web/react/rating";
import { Empty, Failure, Loaded, Skeleton, use_resource } from "@x-tech-laboratories/x-libs/web/react/states";
import { toast } from "@x-tech-laboratories/x-libs/web/react/toasts";

import { calls, use_data, use_settings } from "../api.ts";
import { has_episode, image_url, next_unwatched, parse_episodes, status_labels, statuses, type Collection, type EpisodeRange, type LibraryTitle, type Seasons } from "../../shared/library/model.ts";
import type { TmdbFullDetails, TmdbSeason } from "../../shared/library/tmdb.ts";
import { set_status } from "./status.tsx";

// ── Episodes ─────────────────────────────────────────────────────────────────

async function mark(title: LibraryTitle, ranges: EpisodeRange[], watched: boolean, total_episodes: number): Promise<void> {
  try {
    await calls().set_episodes_watched(title.id, ranges, watched, total_episodes);
  } catch (error) {
    toast((error as Error).message, { tone: "bad" });
  }
}

function SeasonSection({ title, season, watched, total_episodes }: { title: LibraryTitle; season: TmdbSeason; watched: Seasons; total_episodes: number }) {
  const episode_count = season.episodes.length;
  const watched_here = season.episodes.filter((episode) => has_episode(watched, season.number, episode.number)).length;
  const next = next_unwatched(watched, { [season.number]: episode_count });
  const last = season.episodes.at(-1)?.number ?? 0;
  const tools = (
    <>
      {next ? (
        <button type="button" onClick={() => void mark(title, [{ season: season.number, from: next.episode, to: last }], true, total_episodes)}>
          {watched_here === 0 ? "Watch whole season" : "Watch rest of season"}
        </button>
      ) : (
        <span>Season complete</span>
      )}
      {watched_here > 0 && (
        <button type="button" onClick={() => void mark(title, [{ season: season.number, from: 1, to: last }], false, total_episodes)}>
          Unwatch season
        </button>
      )}
    </>
  );
  return (
    <Section title={`${season.name} (${watched_here}/${episode_count})`} tools={tools}>
      <ul className="episode-list">
        {season.episodes.map((episode) => {
          const is_watched = has_episode(watched, season.number, episode.number);
          return (
            <li key={episode.number} className="episode">
              <input
                type="checkbox"
                aria-label={`Watched ${season.number}x${String(episode.number).padStart(2, "0")} ${episode.name}`}
                checked={is_watched}
                onChange={() => void mark(title, [{ season: season.number, from: episode.number, to: episode.number }], !is_watched, total_episodes)}
              />
              {episode.still_path && <img className="episode-still" src={image_url(episode.still_path, "w185")} alt="" loading="lazy" />}
              <div className="episode-text">
                <strong>
                  {episode.number}. {episode.name}
                </strong>
                <span className="episode-facts">{[episode.air_date, episode.runtime ? `${episode.runtime} min` : "", episode.rating ? `★ ${episode.rating.toFixed(1)}` : ""].filter(Boolean).join(" · ")}</span>
                {episode.overview && <p>{episode.overview}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function EpisodesSection({ title, details }: { title: LibraryTitle; details: TmdbFullDetails }) {
  const watched = parse_episodes(title.watched_episodes);
  const total = details.total_episodes;
  const every_season: EpisodeRange[] = details.seasons.map((season) => ({ season: season.number, from: 1, to: season.episodes.at(-1)?.number ?? 0 })).filter((range) => range.to > 0);
  return (
    <Section
      title="Episodes"
      tools={
        <>
          <button type="button" onClick={() => void mark(title, every_season, true, total)}>
            Watch all episodes
          </button>
          <button type="button" disabled={title.watched_count === 0} onClick={() => void mark(title, every_season, false, total)}>
            Unwatch all
          </button>
        </>
      }
    >
      <ProgressBar label="Episodes watched" value={title.watched_count} max={total || title.watched_count || 1} detail={`${title.watched_count} of ${total} episodes`} />
      {details.seasons.map((season) => (
        <SeasonSection key={season.number} title={title} season={season} watched={watched} total_episodes={total} />
      ))}
    </Section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

function Collections({ title, collections }: { title: LibraryTitle; collections: Collection[] }) {
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const chosen = title.collection_ids.map((id) => names.get(id)).filter((name): name is string => !!name);
  // A name not yet a collection is made one, in no group.
  const save = async (next: string[]) => {
    const ids = await Promise.all(next.map((name) => collections.find((collection) => collection.name.toLowerCase() === name.toLowerCase())?.id ?? calls().save_collection({ name, group_id: null })));
    await calls().set_title_collections(title.id, ids);
  };
  return <ChipField label="Collections" values={chosen} suggestions={collections.map((collection) => collection.name)} list_on_focus add_label="Add" placeholder="Add to a collection" on_change={(next) => void save(next)} />;
}

function TitlePage({ title, collections, settings }: { title: LibraryTitle; collections: Collection[]; settings: Record<string, unknown> }) {
  // TMDB is asked once per visit, not after each tick.
  const details = use_resource(() => calls().lookup_title_details(title.id), [title.id]);
  const genres_on = settings["library.genres_enabled"] !== false;

  const remove = () =>
    confirm_dialog({
      title: `Remove ${title.name}?`,
      message: "Its status, rating and watched episodes go with it; History can bring it back.",
      confirm_label: "Remove",
      danger: true,
      run: async () => {
        await calls().remove_title(title.id);
        window.location.hash = "#/library";
      },
    });

  const tmdb = details.data;
  return (
    <Stack>
      <PageHeading
        title={title.name}
        subtitle={[title.year, title.media_type === "show" ? "TV" : "Movie", tmdb?.runtime ? `${tmdb.runtime} min` : ""].filter(Boolean).join(" · ")}
        actions={
          <button type="button" className="danger" onClick={remove}>
            Remove
          </button>
        }
      />
      <div className="title-head">
        {title.poster_path && <img className="title-poster" src={image_url(title.poster_path, "w500")} alt="" />}
        <div className="title-facts">
          <Facts
            rows={[
              [
                "Status",
                <Select
                  label="Status"
                  bare
                  options={statuses.map((status) => [status, status_labels[status]] as [string, string])}
                  value={title.status}
                  on_change={(status) => void set_status(title, status as LibraryTitle["status"])}
                />,
              ],
              ["Rating", <Rating label="Rating" max={10} value={title.rating} on_change={(rating) => void calls().set_title_rating(title.id, rating)} />],
              title.media_type === "show" && ["Episodes", `${title.watched_count} of ${title.total_episodes || "?"} watched${title.watched_episodes ? ` (${title.watched_episodes})` : ""}`],
              genres_on && !!title.genres && ["Genres", title.genres],
              !!title.last_watched && ["Last watched", title.last_watched],
              !!title.added_at && ["Added", title.added_at],
            ]}
          />
          <Collections title={title} collections={collections} />
          {(tmdb?.overview || title.overview) && <p className="title-overview">{tmdb?.overview || title.overview}</p>}
        </div>
      </div>
      {details.status === "loading" && <Skeleton lines={6} />}
      {details.status === "failed" && <Failure error={details.error} retry={() => void details.reload()} />}
      {tmdb && tmdb.cast.length > 0 && (
        <Section title="Cast">
          <ul className="cast-list">
            {tmdb.cast.map((person) => (
              <li key={`${person.name}:${person.character}`} className="cast-member">
                <Avatar src={image_url(person.profile_path, "w185") || null} name={person.name} size="large" />
                <strong>{person.name}</strong>
                <span>{person.character}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {tmdb && title.media_type === "show" && <EpisodesSection title={title} details={tmdb} />}
    </Stack>
  );
}

export function TitleView({ id }: { id: string }) {
  const title = use_data((api) => api.get_title(id), [id]);
  const library = use_data((api) => api.list_library());
  const settings = use_settings();
  return (
    <div className="title-page">
      <Loaded resource={title} empty={<Empty title="That title is not in the library." hint={<a href="#/library">Back to the Library</a>} />}>
        {(loaded) =>
          loaded && (
          <Loaded resource={library}>
            {(collections) => <Loaded resource={settings}>{(values) => <TitlePage title={loaded} collections={collections.collections} settings={values} />}</Loaded>}
          </Loaded>
          )
        }
      </Loaded>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PHOTO_HOLD_MS = 1_350;
const PLAY_START_TIMEOUT_MS = 4_000;
const MIN_VIDEO_VISIBLE_MS = 5_000;
const END_FRAME_HOLD_MS = 800;
const INTRO_EXIT_MS = 620;
const INTRO_VIDEO_PATH = "/intro/fabhexagrogne-film.mp4";

type IntroPhase = "photo" | "ready" | "starting" | "video";
type PlaybackState =
  | "preparing"
  | "ready"
  | "starting"
  | "playing"
  | "ended"
  | "failed";

async function playWithDeadline(video: HTMLVideoElement): Promise<boolean> {
  try {
    const playback = video.play();
    const accepted = await Promise.race([
      playback.then(() => true, () => false),
      new Promise<boolean>((resolve) =>
        window.setTimeout(() => resolve(!video.paused), PLAY_START_TIMEOUT_MS),
      ),
    ]);
    return accepted || !video.paused;
  } catch {
    return false;
  }
}

export default function GameIntro({
  onComplete,
  onRevealGame,
  onStartAudio,
}: {
  onComplete: () => void;
  onRevealGame: () => void;
  onStartAudio: () => void;
}) {
  const [phase, setPhase] = useState<IntroPhase>("photo");
  const [leaving, setLeaving] = useState(false);
  const [playbackState, setPlaybackState] =
    useState<PlaybackState>("preparing");
  const [videoReady, setVideoReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackMessage, setPlaybackMessage] = useState<string>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closingRef = useRef(false);
  const playAttemptRef = useRef(0);
  const videoStartedAtRef = useRef<number | undefined>(undefined);
  const firstFrameCallbackRef = useRef<number | undefined>(undefined);
  const endHoldTimerRef = useRef<number | undefined>(undefined);
  const exitTimerRef = useRef<number | undefined>(undefined);

  const finish = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (endHoldTimerRef.current !== undefined) {
      window.clearTimeout(endHoldTimerRef.current);
      endHoldTimerRef.current = undefined;
    }
    setLeaving(true);
    onRevealGame();
    exitTimerRef.current = window.setTimeout(onComplete, INTRO_EXIT_MS);
  }, [onComplete, onRevealGame]);

  useEffect(() => {
    document.documentElement.classList.add("intro-active");
    const introVideo = videoRef.current;
    const photoTimer = window.setTimeout(() => {
      setPhase((current) => (current === "photo" ? "ready" : current));
    }, PHOTO_HOLD_MS);

    return () => {
      document.documentElement.classList.remove("intro-active");
      window.clearTimeout(photoTimer);
      if (endHoldTimerRef.current !== undefined) {
        window.clearTimeout(endHoldTimerRef.current);
      }
      if (exitTimerRef.current !== undefined) {
        window.clearTimeout(exitTimerRef.current);
      }
      if (
        introVideo &&
        firstFrameCallbackRef.current !== undefined &&
        typeof introVideo.cancelVideoFrameCallback === "function"
      ) {
        introVideo.cancelVideoFrameCallback(firstFrameCallbackRef.current);
      }
      introVideo?.pause();
    };
  }, []);

  const beginVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoReady || closingRef.current) return;
    const attempt = playAttemptRef.current + 1;
    playAttemptRef.current = attempt;
    if (endHoldTimerRef.current !== undefined) {
      window.clearTimeout(endHoldTimerRef.current);
      endHoldTimerRef.current = undefined;
    }
    setPlaybackMessage(undefined);
    setPlaybackState("starting");
    setBuffering(true);
    setProgress(0);
    setPhase("starting");
    videoStartedAtRef.current = undefined;
    if (
      firstFrameCallbackRef.current !== undefined &&
      typeof video.cancelVideoFrameCallback === "function"
    ) {
      video.cancelVideoFrameCallback(firstFrameCallbackRef.current);
      firstFrameCallbackRef.current = undefined;
    }

    // The callback and video.play() run inside the same real tap so mobile
    // Chromium can authorize the video, soundtrack and Web Audio together.
    onStartAudio();
    video.pause();
    video.currentTime = 0;
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;
    video.muted = false;
    video.volume = 0.9;
    setSoundEnabled(true);

    if (await playWithDeadline(video)) return;
    if (attempt !== playAttemptRef.current || closingRef.current) return;

    // Preserve the film if a browser specifically refuses unmuted playback.
    video.pause();
    video.currentTime = 0;
    video.muted = true;
    setSoundEnabled(false);
    if (await playWithDeadline(video)) {
      setPlaybackMessage(
        "La vidéo joue sans son. Touchez « Activer le son » si vous le souhaitez.",
      );
      return;
    }
    if (attempt !== playAttemptRef.current || closingRef.current) return;

    video.pause();
    setBuffering(false);
    setPlaybackState("failed");
    setPlaybackMessage(
      "Le navigateur a refusé la lecture. Réessayez ou passez la présentation.",
    );
    setPhase("ready");
  }, [onStartAudio, videoReady]);

  const skipIntro = () => {
    // "Passer" is also a gesture and can unlock the selected game audio.
    onStartAudio();
    finish();
  };

  const toggleSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (soundEnabled) {
      video.muted = true;
      setSoundEnabled(false);
      return;
    }
    video.muted = false;
    video.volume = 0.9;
    setSoundEnabled(true);
    if (video.paused) await playWithDeadline(video);
  };

  const updateProgress = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    setProgress(Math.min(1, video.currentTime / video.duration));
  };

  const launchLabel =
    playbackState === "failed"
      ? "Réessayer la vidéo"
      : videoReady
        ? "Démarrer l’aventure"
        : "Préparation de la vidéo…";
  const playbackLabel =
    playbackState === "ended"
      ? "La colonie est prête…"
      : playbackState === "starting" || buffering
        ? "Ouverture de la vidéo…"
        : "La colonie s’éveille";
  const videoActive = phase === "starting" || phase === "video";

  return (
    <section
      className={`game-intro intro-${phase}${leaving ? " intro-leaving" : ""}`}
      aria-label="Présentation de FabHexaGrogne"
    >
      <picture className="intro-poster">
        <img
          src="/intro/fabhexagrogne-intro.webp"
          alt="Deux colonies de termites dorées et bleues s’affrontent dans une forêt"
          fetchPriority="high"
          decoding="async"
        />
      </picture>

      <video
        ref={videoRef}
        className="intro-video"
        src={INTRO_VIDEO_PATH}
        data-media-src={INTRO_VIDEO_PATH}
        preload="metadata"
        playsInline
        muted={!soundEnabled}
        onLoadedMetadata={() => {
          setVideoReady(true);
          setPlaybackState((current) =>
            current === "preparing" ? "ready" : current,
          );
        }}
        onCanPlay={() => {
          setVideoReady(true);
          setPlaybackState((current) =>
            current === "preparing" ? "ready" : current,
          );
        }}
        onPlaying={(event) => {
          if (
            videoStartedAtRef.current !== undefined ||
            firstFrameCallbackRef.current !== undefined
          ) {
            return;
          }
          const video = event.currentTarget;
          const revealFirstRealFrame = () => {
            firstFrameCallbackRef.current = undefined;
            if (closingRef.current || videoStartedAtRef.current !== undefined) {
              return;
            }
            videoStartedAtRef.current = performance.now();
            setPhase("video");
            setPlaybackState("playing");
            setBuffering(false);
          };

          if (typeof video.requestVideoFrameCallback === "function") {
            firstFrameCallbackRef.current =
              video.requestVideoFrameCallback(revealFirstRealFrame);
          } else {
            revealFirstRealFrame();
          }
        }}
        onWaiting={() => setBuffering(true)}
        onTimeUpdate={updateProgress}
        onEnded={(event) => {
          if (!event.currentTarget.ended) return;
          setProgress(1);
          setBuffering(false);
          setPlaybackState("ended");
          const startedAt = videoStartedAtRef.current ?? performance.now();
          if (videoStartedAtRef.current === undefined) {
            videoStartedAtRef.current = startedAt;
            setPhase("video");
          }
          const elapsed = performance.now() - startedAt;
          const remainingVideoTime = Math.max(
            0,
            MIN_VIDEO_VISIBLE_MS - elapsed,
          );
          endHoldTimerRef.current = window.setTimeout(
            finish,
            remainingVideoTime + END_FRAME_HOLD_MS,
          );
        }}
        onError={() => {
          setBuffering(false);
          setPlaybackState("failed");
          setPlaybackMessage(
            "Impossible de préparer la vidéo. Réessayez ou passez la présentation.",
          );
          setPhase("ready");
        }}
      />

      <div className="intro-vignette" aria-hidden="true" />
      <div className="intro-title-rail" hidden={phase !== "video"}>
        <h1 className="intro-gold-title" aria-label="FabHexaGrogne !">
          <span>FAB</span>
          <strong>HEXA</strong>
          <strong>GROGNE&nbsp;!</strong>
        </h1>
      </div>

      <div
        className="intro-start-panel"
        aria-live="polite"
        hidden={phase !== "ready"}
      >
        <span>PHOTO DE PRÉSENTATION</span>
        <button
          className="intro-start"
          type="button"
          disabled={!videoReady}
          onClick={() => void beginVideo()}
        >
          <b aria-hidden="true">▶</b>
          {launchLabel}
        </button>
        <small>Un toucher lance la vidéo avec son, puis ouvre le jeu.</small>
        {playbackMessage && <em>{playbackMessage}</em>}
      </div>

      <button className="intro-skip" type="button" onClick={skipIntro}>
        Passer
      </button>
      {videoActive && (
        <button
          className="intro-sound"
          type="button"
          aria-pressed={soundEnabled}
          onClick={() => void toggleSound()}
        >
          <span aria-hidden="true">{soundEnabled ? "🔊" : "🔇"}</span>
          {soundEnabled ? "Son actif" : "Activer le son"}
        </button>
      )}

      {videoActive && (
        <div className="intro-loading" role="status">
          <span>{playbackLabel}</span>
          <i aria-hidden="true">
            <b style={{ width: `${Math.max(4, progress * 100)}%` }} />
          </i>
          {playbackMessage && <small>{playbackMessage}</small>}
        </div>
      )}
    </section>
  );
}

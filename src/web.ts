import { WebPlugin } from '@capacitor/core';
import { RmxAudioStatusMessage } from './Constants';
import {
    AddAllItemOptions,
    AddItemOptions,
    PlayByIdOptions,
    PlayByIndexOptions,
    PlaylistOptions,
    PlaylistPlugin,
    RemoveItemOptions,
    RemoveItemsOptions,
    SeekToOptions,
    SelectByIdOptions,
    SelectByIndexOptions,
    SetLoopOptions,
    SetPlaybackRateOptions,
    SetPlaybackVolumeOptions,
    InsertItemOptions
} from './definitions';
import { AudioPlayerOptions, AudioTrack } from './interfaces';
import { validateTrack, validateTracks } from './utils';

declare var Hls: any;

export class PlaylistWeb extends WebPlugin implements PlaylistPlugin {
    protected audio: HTMLAudioElement | undefined;
    protected playlistItems: AudioTrack[] = [];
    protected loop = false;
    protected options: AudioPlayerOptions = {};
    protected currentTrack: AudioTrack | null = null;
    protected lastState = 'stopped';
    protected excerptStartTime: number = 0;
    protected excerptEndTime: number | null = null;

    addAllItems(options: AddAllItemOptions): Promise<void> {
        this.playlistItems = this.playlistItems.concat(validateTracks(options.items));
        return Promise.resolve();
    }

    addItem(options: AddItemOptions): Promise<void> {
        const track = validateTrack(options.item);
        if (track) {
            this.playlistItems.push(track);
            this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_ITEM_ADDED, track, track.trackId);
        }
        return Promise.resolve();
    }

    insertItem(options: InsertItemOptions): Promise<void> {
        const track = validateTrack(options.item);
        if (!track) {
            return Promise.resolve();
        }
        let insertIndex = -1;
        if (typeof options.index === 'number' && options.index >= 0 && options.index <= this.playlistItems.length) {
            insertIndex = options.index;
        } else if (options.id) {
            const foundIndex = this.playlistItems.findIndex(t => t.trackId === options.id);
            if (foundIndex >= 0) {
                insertIndex = foundIndex + 1;
            }
        }
        if (insertIndex >= 0) {
            this.playlistItems.splice(insertIndex, 0, track);
        } else {
            this.playlistItems.push(track);
        }
        this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_ITEM_ADDED, track, track.trackId);
        return Promise.resolve();
    }

    async clearAllItems(): Promise<void> {
        await this.release();
        this.playlistItems = [];
        this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_PLAYLIST_CLEARED, null, "INVALID");
        return Promise.resolve();
    }

    async initialize(): Promise<void> {
        this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_INIT, null, "INVALID");
        return Promise.resolve();
    }

    async pause(): Promise<void> {
        this.audio?.pause();
    }

    async play(): Promise<void> {
        await this.audio?.play();
    }

    async playTrackById(options: PlayByIdOptions): Promise<void> {
        for (let track of this.playlistItems) {
            if (track.trackId === options.id) {
                if (track !== this.currentTrack) {
                    await this.setCurrent(track);
                    if (this.audio && options?.position && options.position! > 0) {
                        this.audio!.currentTime = this.excerptStartTime + options.position!;
                    }
                }
                return this.play();
            }
        }
        return Promise.reject();
    }

    async playTrackByIndex(options: PlayByIndexOptions): Promise<void> {
        for (let { index, item } of this.playlistItems.map((item, index) => ({ index, item }))) {
            if (index === options.index) {
                if (item !== this.currentTrack) {
                    await this.setCurrent(item);
                    if (this.audio && options?.position && options.position! > 0) {
                        this.audio!.currentTime = this.excerptStartTime + options.position!;
                    }
                }
                return this.play();
            }
        }
        return Promise.reject();
    }

    async release(): Promise<void> {
        await this.pause();
        this.audio = undefined;
        return Promise.resolve();
    }

    async create(): Promise<void> {
        this.audio = document.createElement('audio');
        this.audio.crossOrigin = 'anonymous';
        this.audio.preload = 'metadata';
        this.audio.controls = true;
        this.audio.autoplay = false;
        return Promise.resolve();
    }

    removeItem(options: RemoveItemOptions): Promise<void> {
        this.playlistItems.forEach((item, index) => {
            if (options.index && options.index === index) {
                const removedTrack = this.playlistItems.splice(index, 1);

                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_ITEM_REMOVED, removedTrack[0], removedTrack[0].trackId);
            } else if (options.id && options.id === item.trackId) {
                const removedTrack = this.playlistItems.splice(index, 1);
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_ITEM_REMOVED, removedTrack[0], removedTrack[0].trackId);
            }
        });
        return Promise.resolve();
    }

    removeItems(options: RemoveItemsOptions): Promise<void> {
        options.items.forEach(async (item) => {
            await this.removeItem(item);
        });
        return Promise.resolve();
    }

    seekTo(options: SeekToOptions): Promise<void> {
        if (this.audio) {
            const seekPosition = this.excerptStartTime + options.position;
            const maxPosition = this.excerptEndTime || this.audio.duration;
            
            if (seekPosition >= maxPosition) {
                // Seek past the end of excerpt, trigger track completion
                this.audio.currentTime = maxPosition;
                this.audio.dispatchEvent(new Event('ended'));
            } else {
                this.audio.currentTime = seekPosition;
            }
            return Promise.resolve();
        }
        return Promise.reject();
    }

    selectTrackById(options: SelectByIdOptions): Promise<void> {
        for (const item of this.playlistItems) {
            if (item.trackId === options.id) {
                return this.setCurrent(item);
            }
        }
        return Promise.reject();
    }

    selectTrackByIndex(options: SelectByIndexOptions): Promise<void> {
        let index = 0;
        for (const item of this.playlistItems) {
            if (index === options.index) {
                return this.setCurrent(item);
            }
            index++;
        }
        return Promise.reject();
    }

    setLoop(options: SetLoopOptions): Promise<void> {
        this.loop = options.loop;
        return Promise.resolve();
    }

    setOptions(options: AudioPlayerOptions): Promise<void> {
        this.options = options || {};
        return Promise.resolve();
    }

    setPlaybackVolume(options: SetPlaybackVolumeOptions): Promise<void> {
        if (this.audio) {
            this.audio.volume = options.volume;
            return Promise.resolve();
        }
        return Promise.reject();
    }

    async setPlaylistItems(options: PlaylistOptions): Promise<void> {
        this.playlistItems = options.items;
        if (this.playlistItems.length > 0) {
            let currentItem = this.playlistItems.filter(i => i.trackId === options.options?.playFromId)[0];
            if (!currentItem) {
                currentItem = this.playlistItems[0];
            }
            await this.setCurrent(currentItem, options.options?.playFromPosition ?? 0);
            if (!options.options?.startPaused) {
                await this.play();
            }
        }
        return Promise.resolve();
    }

    async skipForward(): Promise<void> {
        let found: number | null = null;
        this.playlistItems.forEach((item, index) => {
            if (!found && this.getCurrentTrackId() === item.trackId) {
                found = index;
            }
        });

        if (found === this.playlistItems.length - 1) {
            found = -1;
        }

        if (found !== null) {
            this.updateStatus(RmxAudioStatusMessage.RMX_STATUS_SKIP_BACK, {
                currentIndex: found + 1,
                currentItem: this.playlistItems[found + 1]
            }, this.playlistItems[found + 1].trackId);
            return this.setCurrent(this.playlistItems[found + 1]);
        }

        return Promise.reject();
    }

    async skipBack(): Promise<void> {
        let found: number | null = null;
        this.playlistItems.forEach((item, index) => {
            if (!found && this.getCurrentTrackId() === item.trackId) {
                found = index;
            }
        });
        if (found === 0) {
            found = this.playlistItems.length - 1;
        }

        if (found !== null) {
            this.updateStatus(RmxAudioStatusMessage.RMX_STATUS_SKIP_BACK, {
                currentIndex: found - 1,
                currentItem: this.playlistItems[found - 1]
            }, this.playlistItems[found - 1].trackId);
            return this.setCurrent(this.playlistItems[found - 1]);
        }

        return Promise.reject();
    }

    setPlaybackRate(options: SetPlaybackRateOptions): Promise<void> {
        if (this.audio) {
            this.audio.playbackRate = options.rate;
            return Promise.resolve();
        }
        return Promise.reject();
    }

    async setMediaSessionRemoteControlMetadata(): Promise<void> {
        const audioTrack: AudioTrack = this.currentTrack!;
        if(!navigator.mediaSession) {
            console.warn('Media Session API not available');
            return Promise.reject();
        }

        const excerptDuration = this.excerptEndTime ? 
            (this.excerptEndTime - this.excerptStartTime) : 
            (this.audio?.duration || 0) - this.excerptStartTime;

        navigator.mediaSession.metadata = new MediaMetadata({
            title: audioTrack.title,
            artist: audioTrack.artist,
            album: audioTrack.album,
            artwork: [
                { src: audioTrack.albumArt!, sizes: '96x96',   type: 'image/jpeg' },
                { src: audioTrack.albumArt!, sizes: '128x128', type: 'image/jpeg' },
                { src: audioTrack.albumArt!, sizes: '192x192', type: 'image/jpeg' },
                { src: audioTrack.albumArt!, sizes: '256x256', type: 'image/jpeg' },
                { src: audioTrack.albumArt!, sizes: '384x384', type: 'image/jpeg' },
                { src: audioTrack.albumArt!, sizes: '512x512', type: 'image/jpeg' },
            ]
        });

        // Set the duration for the media session
        if (navigator.mediaSession.setPositionState) {
            navigator.mediaSession.setPositionState({
                duration: excerptDuration,
                playbackRate: this.audio?.playbackRate || 1,
                position: this.getCurrentTrackStatus(this.lastState).currentPosition
            });
        }

        navigator.mediaSession.setActionHandler('play', (details) => {this.mediaSessionControlsHandler(details)});
        navigator.mediaSession.setActionHandler('pause', (details) => {this.mediaSessionControlsHandler(details)});
        navigator.mediaSession.setActionHandler('nexttrack', (details) => {this.mediaSessionControlsHandler(details)});
        navigator.mediaSession.setActionHandler('previoustrack', (details) => {this.mediaSessionControlsHandler(details)});
        navigator.mediaSession.setActionHandler('seekto', (details) => {this.mediaSessionControlsHandler(details)});
        return Promise.resolve();
    }

    async mediaSessionControlsHandler(actionDetails: MediaSessionActionDetails): Promise<void> {
        switch(actionDetails.action) {
            case 'play':
              this.play();
              break;
            case 'pause':
              this.pause();
              break;
            case 'nexttrack':
              this.skipForward();
              break;
            case 'previoustrack':
              this.skipBack();
              break;
            case 'seekto':
              if (actionDetails.seekTime !== undefined) {
                // Convert excerpt-relative position to absolute position
                const absolutePosition = this.excerptStartTime + actionDetails.seekTime;
                this.audio!.currentTime = absolutePosition;
              }
              break;
          }
        return Promise.resolve();
    }

    // register events
    /*
      private registerHlsListeners(hls: Hls, position?: number) {
        hls.on(Hls.Events.MANIFEST_PARSED, async () => {
          this.notifyListeners('status', {
            action: "status",
            status: {
              msgType: RmxAudioStatusMessage.RMXSTATUS_CANPLAY,
              trackId: this.getCurrentTrackId(),
              value: this.getCurrentTrackStatus('loading'),
            }
          })
          if(position) {
            await this.seekTo({position});
          }
        });
      }*/
    registerHtmlListeners(position?: number) {
        const canPlayListener = async () => {
            this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_CANPLAY, this.getCurrentTrackStatus('paused'));
            if (position) {
                await this.seekTo({ position });
            }
            this.audio?.removeEventListener('canplay', canPlayListener);
        };
        if (this.audio) {
            this.audio.addEventListener('loadstart', () => {this.setMediaSessionRemoteControlMetadata()});
            this.audio.addEventListener('canplay', canPlayListener);
            this.audio.addEventListener('playing', () => {
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_PLAYING, this.getCurrentTrackStatus('playing'));
            });

            this.audio.addEventListener('pause', () => {
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_PAUSE, this.getCurrentTrackStatus('paused'));
            });

            this.audio.addEventListener('error', () => {
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_ERROR, this.getCurrentTrackStatus('error'));
            });

            this.audio.addEventListener('ended', () => {
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_COMPLETED, this.getCurrentTrackStatus('stopped'));
                const currentTrackIndex = this.playlistItems.findIndex(i => i.trackId === this.getCurrentTrackId());
                if (currentTrackIndex === this.playlistItems.length - 1) {
                    this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_PLAYLIST_COMPLETED, this.getCurrentTrackStatus('stopped'));
                } else {
                    this.setCurrent(this.playlistItems[currentTrackIndex + 1], undefined, true);
                }
            });

            let lastTrackId: any, lastPosition: any;
            this.audio.addEventListener('timeupdate', () => {
                // Check for excerpt end
                if (this.excerptEndTime && this.audio!.currentTime >= this.excerptEndTime) {
                    // Reached end of excerpt, trigger completion
                    console.log('Excerpt end reached, triggering track completion');
                    this.audio!.pause();
                    this.audio!.dispatchEvent(new Event('ended'));
                    return;
                }
                
                // Update playback position
                const status = this.getCurrentTrackStatus(this.lastState);
                if (lastTrackId !== this.getCurrentTrackId() || lastPosition !== status.currentPosition) {
                    this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_PLAYBACK_POSITION, status);
                    lastTrackId = this.getCurrentTrackId();
                    lastPosition = status.currentPosition;
                }
            });

            this.audio.addEventListener('durationchange', () => {
                this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_DURATION, this.getCurrentTrackStatus(this.lastState));
            });
        }
    }

    protected getCurrentTrackId() {
        if (this.currentTrack) {
            return this.currentTrack.trackId;
        }
        return 'INVALID';
    }

    protected getCurrentIndex() {
        if (this.currentTrack) {
            for (let i = 0; i < this.playlistItems.length; i++) {
                if (this.playlistItems[i].trackId === this.currentTrack.trackId) {
                    return i;
                }
            }
        }
        return -1;
    }

    protected getCurrentTrackStatus(currentState: string) {
        this.lastState = currentState;
        const currentTime = this.audio?.currentTime || 0;
        const duration = this.audio?.duration || 0;
        
        // Calculate excerpt-relative values
        const excerptDuration = this.excerptEndTime ? 
            (this.excerptEndTime - this.excerptStartTime) : 
            (duration - this.excerptStartTime);
        
        const excerptCurrentPosition = Math.max(0, currentTime - this.excerptStartTime);
        
        return {
            trackId: this.getCurrentTrackId(),
            isStream: !!this.currentTrack?.isStream,
            currentIndex: this.getCurrentIndex(),
            status: currentState,
            currentPosition: excerptCurrentPosition,
            duration: excerptDuration,
        };
    }

    protected async setCurrent(item: AudioTrack, position?: number, forceAutoplay: boolean = false) {
        let wasPlaying = false;
        if (this.audio) {
            wasPlaying = !this.audio.paused;
            await this.release();
        }
        await this.create();

        this.currentTrack = item;
        
        // Set up excerpt timing
        this.excerptStartTime = item.startTime || 0;
        this.excerptEndTime = item.endTime || null;
        
        if (item.assetUrl.includes('.m3u8')) {
            await this.loadHlsJs();

            const hls = new Hls({
                autoStartLoad: true,
                debug: false,
                enableWorker: true,
            });
            hls.attachMedia(this.audio);
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(item.assetUrl);
            });

            //this.registerHlsListeners(hls, position);
        } else {
            this.audio!.src = item.assetUrl;
        }

        await this.registerHtmlListeners(position);

        this.updateStatus(RmxAudioStatusMessage.RMXSTATUS_TRACK_CHANGED, {
            currentItem: item
        })

        if (wasPlaying || forceAutoplay) {
            //this.play();
            this.audio!.addEventListener('canplay', () => {
                // Set initial position if specified
                if (position !== undefined) {
                    this.audio!.currentTime = this.excerptStartTime + position;
                } else {
                    this.audio!.currentTime = this.excerptStartTime;
                }
                this.play();
            });
        }
    }

    protected updateStatus(msgType: RmxAudioStatusMessage, value: any, trackId?: string) {
        this.notifyListeners('status', {
            action: 'status',
            status: {
                msgType: msgType,
                trackId: trackId ? trackId : this.getCurrentTrackId(),
                value: value
            }
        });
    }

    private hlsLoaded = false;

    protected loadHlsJs() {
        if (window.Hls !== undefined || this.hlsLoaded) {
            return Promise.resolve();
        }
        return new Promise(
            (resolve, reject) => {
                console.log("LOADING HLS FROM CDN");
                const script = document.createElement('script');
                script.type = 'text/javascript';
                script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.1.1';
                document.getElementsByTagName('head')[0].appendChild(script);
                script.onload = () => {
                    this.hlsLoaded = true;
                    resolve(void 0);
                };
                script.onerror = () => {
                    reject();
                };
            });
    }
}

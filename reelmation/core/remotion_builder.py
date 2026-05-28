from typing import Dict, Any

class RemotionBuilder:
    """Transforms a generated ReelManifest into the exact JSON props Remotion needs."""
    
    @staticmethod
    def build_props(manifest: Dict[str, Any]) -> Dict[str, Any]:
        """
        Builds the props.json for Remotion ReelComposition.
        Expects a manifest dictionary (can be adapted to ReelManifest dataclass).
        """
        sentences = manifest.get("sentences", [])
        n = len(sentences)
        
        broll_images = []
        for i, s in enumerate(sentences):
            act = RemotionBuilder._calculate_act(i, n)
            start = s.get("start_frame", 0)
            end = s.get("image_end_frame", s.get("end_frame", 0))
            duration = max(end - start, 1)
            broll_images.append({
                "url": s.get("image_file", ""),
                "durationInFrames": duration,
                "act": act,
            })
            
        subtitles = []
        for i, s in enumerate(sentences):
            act = RemotionBuilder._calculate_act(i, n)
            words = []
            for w in s.get("words", []):
                words.append({
                    "text": w.get("text", ""),
                    "startFrame": w.get("start_frame", 0),
                    "endFrame": w.get("end_frame", 0),
                })
            subtitles.append({
                "text": s.get("text", ""),
                "startFrame": s.get("start_frame", 0),
                "endFrame": s.get("end_frame", 0),
                "act": act,
                "words": words,
            })
            
        return {
            "audioUrl": manifest.get("audio_file", ""),
            "brollImages": broll_images,
            "subtitles": subtitles,
            "totalFrames": manifest.get("total_frames", 0),
        }
        
    @staticmethod
    def _calculate_act(index: int, total: int) -> int:
        """Determines if a sentence is in Act 1, 2, or 3 based on its position."""
        if total <= 1:
            return 1
        elif total == 2:
            return 1 if index == 0 else 3
        else:
            ratio = index / total
            if ratio < 1.0 / 3.0:
                return 1
            elif ratio < 2.0 / 3.0:
                return 2
            else:
                return 3

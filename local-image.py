import base64
import io
import os
import sys

def main():
    prompt = " ".join(sys.argv[1:]).strip()
    if not prompt:
        raise SystemExit("Bild-Prompt fehlt.")
    try:
        import torch
        from diffusers import AutoPipelineForText2Image
    except Exception as exc:
        raise SystemExit("Lokales Bildmodell fehlt. Installiere torch und diffusers.") from exc

    model_id = os.environ.get("TREXOR_IMAGE_MODEL", "stabilityai/sdxl-turbo")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    pipe = AutoPipelineForText2Image.from_pretrained(model_id, torch_dtype=dtype)
    pipe = pipe.to(device)
    steps = 4 if "turbo" in model_id.lower() else 20
    scale = 0.0 if "turbo" in model_id.lower() else 7.0
    image = pipe(prompt=prompt, num_inference_steps=steps, guidance_scale=scale).images[0]
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    print(base64.b64encode(buf.getvalue()).decode())

if __name__ == "__main__":
    main()

from PIL import Image, ImageDraw

def create_placeholder_icon(path="build/icon.ico", size=(256, 256), color=(70, 130, 180)):
    """Creates a simple colored square icon and saves it as .ico"""
    try:
        img = Image.new('RGB', size, color=color)
        d = ImageDraw.Draw(img)
        d.text((10,10), "GC", fill=(255,255,255))
        
        # Ensure build directory exists
        import os
        if not os.path.exists("build"):
            os.makedirs("build")
            
        img.save(path, format='ICO')
        print(f"Successfully created placeholder icon at: {path}")
    except Exception as e:
        print(f"Error creating icon: {e}")

if __name__ == "__main__":
    create_placeholder_icon()

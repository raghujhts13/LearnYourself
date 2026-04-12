# ⚠️ MANUAL DEPLOYMENT REQUIRED

## The Issue

The automated file replacement is not working due to file system caching or locks. You need to manually replace the landing page file.

---

## ✅ SOLUTION: Manual File Replacement

### **Step 1: Close Dev Server**

If your dev server (`pnpm dev`) is running, **stop it first** (Ctrl+C).

### **Step 2: Replace the File Manually**

**Option A: Via IDE/Editor**

1. Open `app/page-classroom-based.tsx` in your editor
2. Select all content (Ctrl+A)
3. Copy (Ctrl+C)
4. Open `app/page.tsx`
5. Select all content (Ctrl+A)
6. Paste (Ctrl+V)
7. Save (Ctrl+S)

**Option B: Via Command Line (PowerShell)**

```powershell
cd d:\vibeCodeproject\openMAIC\OpenMAIC
Remove-Item app\page.tsx -Force
Copy-Item app\page-classroom-based.tsx app\page.tsx
```

**Option C: Via File Explorer**

1. Navigate to `d:\vibeCodeproject\openMAIC\OpenMAIC\app`
2. Delete `page.tsx`
3. Copy `page-classroom-based.tsx`
4. Rename the copy to `page.tsx`

### **Step 3: Verify**

Check that `app/page.tsx` now contains:
- Import statement: `import { CreateClassroomDialog } from '@/components/home/CreateClassroomDialog';`
- Function: `export default function ClassroomBasedHomePage()`
- **NO** imports like `createPortal`, `ThumbnailSlide`, `FolderRecord`

### **Step 4: Start Dev Server**

```bash
pnpm dev
```

---

## 🎯 WHAT TO EXPECT AFTER DEPLOYMENT

### **Landing Page Should Show:**

**If No Classrooms:**
- Hero message: "My Classrooms"
- Subtitle: "Create your first classroom to get started"
- Big purple button: "+ Create Classroom"

**If Classrooms Exist:**
- Header with "My Classrooms" title
- "+ Create Classroom" button in top-right
- Grid of classroom cards (3 columns on desktop)
- Each card shows:
  - Classroom name
  - Description
  - Class count
  - Last active date
  - Three-dots menu with actions

### **Creating Classes:**

**From Landing Page:**
1. Click "+ Create Classroom"
2. Fill in name and description
3. Click card's menu → "Add Class"
4. Fill in topic
5. **(NEW)** Select classroom from dropdown
6. **(NEW)** Or click "+ New" to create classroom
7. Upload document (optional)
8. Toggle quiz and generation mode
9. Click "Generate Class"

---

## 🔧 FEATURES IMPLEMENTED

### **✅ Classroom Selection in Class Creation**

When creating a class, you can now:
- Select which classroom to add it to (dropdown)
- Click "+ New" to create a new classroom on the fly
- Leave unselected for unassigned classes

### **✅ Classroom-Based Organization**

- Landing page shows classrooms (not individual classes)
- Click classroom → View all classes inside
- Create classes within specific classrooms
- Auto-migration from folders on first load

### **✅ All Your Past Classes Are Safe**

- Automatic migration runs once
- All folders converted to classrooms
- All classes preserved
- Check browser console for "Migrated folders to classrooms" message

---

## 🐛 TROUBLESHOOTING

### **Issue: TypeScript Errors**

If you see errors like "Cannot find name 'ClassroomCard'":
- ✅ You didn't replace the file correctly
- ✅ The old page.tsx is still active
- ✅ Follow Step 2 again carefully

### **Issue: Blank Page**

- ✅ Check browser console for errors
- ✅ Restart dev server
- ✅ Clear browser cache (Ctrl+Shift+R)

### **Issue: Old UI Still Shows**

- ✅ Hard refresh (Ctrl+Shift+R)
- ✅ Check `app/page.tsx` starts with `ClassroomBasedHomePage`
- ✅ Restart dev server

### **Issue: "No classrooms yet" but I had classes**

- ✅ Check browser console
- ✅ Look for migration message
- ✅ Open DevTools → Application → IndexedDB → OpenMAIC → classrooms table
- ✅ Verify classrooms exist

---

## 📞 NEED HELP?

If manual deployment doesn't work:

1. **Check File Permissions**: Ensure `app/page.tsx` is not read-only
2. **Check IDE**: Close and reopen your editor
3. **Check Git**: Ensure file isn't locked by version control
4. **Nuclear Option**: Delete `app/page.tsx`, copy classroom-based file, rename to `page.tsx`

---

## ✨ AFTER SUCCESSFUL DEPLOYMENT

You'll have:
- ✅ Modern classroom-based UI
- ✅ All past classes visible (after migration)
- ✅ Ability to tag classes to classrooms
- ✅ Classroom dropdown in class creation
- ✅ "+ New" button to create classrooms on the fly
- ✅ Clean, organized landing page

**Restart your dev server and enjoy the new UI! 🚀**

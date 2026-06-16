// objc_try.m — Exception catcher for Rust FFI in the voice overlay.
//
// AppKit drawing / NSAttributedString construction can raise NSException,
// which would unwind through Rust frames and abort the process. Wrapping the
// callback in @try/@catch lets us log and recover instead.
#import <Foundation/Foundation.h>

// Calls `fn_ptr(context)` inside @try/@catch.
// Returns 0 on success, 1 on ObjC exception, 2 on any other exception.
int objc_try_catch(void (*fn_ptr)(void *), void *context) {
    @try {
        fn_ptr(context);
        return 0;
    } @catch (NSException *exception) {
        NSLog(@"[otoji] ObjC exception caught: %@ — %@", exception.name, exception.reason);
        return 1;
    } @catch (id other) {
        NSLog(@"[otoji] foreign exception caught (C++/Rust panic)");
        return 2;
    }
}
